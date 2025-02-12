import dbLocal from "db-local";
import crypto from "node:crypto"
import bcrypt from "bcrypt"
import { SALT_ROUNDS } from "./config.js";

const { Schema } = new dbLocal({ path: './db' })


// Schemas
export const Session = Schema('Session', {
	_id: { type: String, required: true },
	user: { type: String, required: true },
	expires: { type: String, required: true }
})

export const User = Schema('User', {
	_id: { type: String, required: true },
	username: { type: String, required: true },
	password: { type: String, required: true },
	isAdmin: { type: Boolean, default: false }
})


export const Attendance = Schema('Attendance', {
	_id: { type: String, required: true },
	userId: { type: String, required: true },
	timestamp: { type: String, required: true },
	status: { type: String, enum: ['Present', 'Absent', 'Late'], default: 'Present' }
})


export const Schedule = Schema('Schedule', {
	_id: { type: String, required: true },
	userId: { type: String, required: true },
	day: { type: String, required: true }, // Lunes, Martes, etc.
	startTime: { type: String, required: true },
	endTime: { type: String, required: true }
});


export const Permission = Schema('Permission', {
	_id: { type: String, required: true },
	userId: { type: String, required: true },
	reason: { type: String, required: true },
	startDate: { type: String, required: true },
	endDate: { type: String, required: true },
	status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' }
});









// Funciones





export class RegisterApp {
	static async create({ username, password }) {
		Validation.username(username)
		Validation.password(password)


		// Comprobacion de que el usuario no exista
		const user = User.findOne({ username })
		if (user) throw new Error('Usuario ya existe');

		const id = crypto.randomUUID()
		const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)

		User.create({
			_id: id,
			username,
			password: hashedPassword
		}).save()


		return id

	}



	static async login({ username, password }) {
		Validation.username(username)
		Validation.password(password)
		const user = User.findOne({ username })
		if (!user) throw new Error('El usuario no fue encontrado')


		const isValid = await bcrypt.compare(password, user.password)

		if (!isValid) throw new Error("La contraseña es invalida")

		const { password: _, ...publicUser } = user

		return publicUser
	}
}


class Validation {
	static username(username) {
		if (typeof username != 'string') throw new Error('Usuario deberia ser un string')
		if (username.length < 3) throw new Error('Usuario deberia tener al menos 3 caracteres')
	}

	static password(password) {
		if (typeof password != 'string') throw new Error('La contraseña deberia ser un String')
		if (password.length < 6) throw new Error('La contraseña deberia tener al menos 6 caracteres');
	}
}


export class AttendanceApp {
	static async markAttendance({ userId, status = 'Present' }) {
		if (!userId) throw new Error('Se requiere un usuario');

		const id = crypto.randomUUID();
		const timestamp = new Date().toISOString();

		Attendance.create({
			_id: id,
			userId,
			timestamp,
			status
		}).save();

		return { message: 'Asistencia registrada correctamente' };
	}
}


export const ScheduleAppUsers = {
	getAllUsersWithSchedules() {
		try {
			// Obtener todos los usuarios
			const users = User.find({});
			if (!users.length) throw new Error('No hay usuarios registrados');

			// Obtener todos los horarios
			const schedules = Schedule.find({});

			// Relacionar usuarios con sus horarios
			const usersWithSchedules = users.map(user => {
				const userSchedule = schedules.filter(schedule => schedule.userId === user._id);
				return {
					userId: user._id,
					username: user.username,
					schedule: userSchedule
				};
			});

			return usersWithSchedules;
		} catch (error) {
			console.error('Error obteniendo usuarios y horarios:', error);
			throw new Error('No se pudieron recuperar los horarios');
		}
	}
};







export class ScheduleApp {
	static async getUserSchedule({userId}) {
		if (!userId) throw new Error('Se requiere un usuario');
		const schedule = await Schedule.findOne({ userId });
		
		return schedule;
	}

	static async getAllUserSchedule({userId}) {
		if (!userId) throw new Error('Se requiere un usuario');
		const schedule = await Schedule.find({ userId });
		
		
		return schedule;
	}


	static async markAttendance({ userId, status = 'Present' }) {
		const schedule = await Schedule.findOne({ userId });
		if (!schedule) throw new Error('El usuario no tiene horario asignado');
	
		const { startTime, endTime } = schedule;
	
		const currentTime = new Date().toLocaleTimeString('en-GB', { hour12: false }).substring(0, 5); // 'HH:mm'
	
		let attendanceStatus = status;
	
		// Comprobar si el usuario está marcando tarde
		if (status === 'Present' && currentTime > startTime) {
			attendanceStatus = 'Late';
		}
	
		// Si no marcó asistencia
		if (status === 'Absent' && !currentTime) {
			attendanceStatus = 'Absent';
		}
	
		const id = crypto.randomUUID();
		const timestamp = new Date().toISOString();
	
		Attendance.create({
			_id: id,
			userId,
			timestamp,
			status: attendanceStatus
		}).save();
	
		return { message: 'Asistencia registrada correctamente' };
	}
	

	static async createSchedule({ userId, day, startTime, endTime, isAdmin }) {
		// Verificar que el usuario que está haciendo la solicitud sea el administrador
		const adminUser = User.findOne({ _id: isAdmin });
		console.log("admin", adminUser)
		if (!adminUser || !adminUser.isAdmin) {
			throw new Error('Solo el administrador puede asignar horarios');
		}

		// Crear el horario para el usuario
		const id = crypto.randomUUID();
		Schedule.create({
			_id: id,
			userId,
			day,
			startTime,
			endTime
		}).save();

		return { message: 'Horario asignado correctamente' };
	}



	static updateSchedule = async (userId, { day, startTime, endTime }) => {
		const schedule = await Schedule.findOne({ userId });
		if (!schedule) throw new Error('Horario no encontrado');
	
		// Actualizar el horario
		schedule.day = day;
		schedule.startTime = startTime;
		schedule.endTime = endTime;
		await Schedule.updateOne({ _id: schedule._id }, schedule); // Usar updateOne si no usas Mongoose
		return schedule;
	};
	

}


export class PermissionApp {
	static async requestPermission({ userId, reason, startDate, endDate }) {
		if (!userId || !reason || !startDate || !endDate) throw new Error('Todos los campos son obligatorios');

		const id = crypto.randomUUID();

		Permission.create({
			_id: id,
			userId,
			reason,
			startDate,
			endDate,
			status: 'Pending'
		}).save();

		return { message: 'Permiso solicitado correctamente' };
	}
}


export class ReportApp {
	static async generateAttendanceReport(userId) {
		if (!userId) throw new Error('Se requiere un usuario');
		const records = Attendance.find({ userId });

		return records.map(record => ({
			...record,
			status: record.status === 'Late' ? 'Tardanza' : record.status === 'Absent' ? 'Inasistencia' : 'Presente'
		}));
	}
}
