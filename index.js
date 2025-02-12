import express from 'express'
import { PORT, SECRET_JWT_KEY } from './config.js'
import { AttendanceApp, Permission, PermissionApp, RegisterApp, ReportApp, ScheduleApp, Schedule, ScheduleAppUsers, Attendance, User } from './registerDB.js'
import jwt from 'jsonwebtoken'
import cookieParser from 'cookie-parser'
import mongoose from 'mongoose';
import methodOverride from 'method-override';


const app = express()

app.use(methodOverride('_method'));
// ejs es para usar html
app.set('view engine', 'ejs')

app.use(express.urlencoded({ extended: true }));
app.use(express.json())
app.use(cookieParser())


// Middleware session
app.use((req, res, next) => {
    const token = req.cookies.access_token
    req.session = { user: null }

    if (token) {
        try {
            const data = jwt.verify(token, SECRET_JWT_KEY)
            req.session.user = data
        } catch (error) {
            console.error("Error al verificar JWT:", error.message)
        }
    }

    next()
})



app.get('/', async (req, res) => {
    const { user } = req.session;
    if (!user) return res.redirect('/login');

    try {
        const userSchedule = await ScheduleApp.getUserSchedule({ userId: user.id });
        let attendanceStatus = 'Registered'; // Asistencia por defecto como registrada.
        // console.log(userSchedule)


        const allUserSchedules = await ScheduleApp.getAllUserSchedule({ userId: user.id })
        // console.log(allUserSchedules)

        const totalPresent = await Attendance.find({
            userId: user.id,
            status: "Present"
        }).length;


        const totalLate = await Attendance.find({
            userId: user.id,
            status: "Late"
        }).length;


        // Contar los días en los que no se registró asistencia
        const totalAbsent = await Attendance.find({
            userId: user.id,
            status: "Absent"
        }).length;


        if (!userSchedule) {
            attendanceStatus = "No tienes un horario asignado.";
        } else {
            const now = new Date();
            const currentDay = now.toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'America/Guayaquil' }).toLowerCase();
            const currentTime = now.toTimeString().slice(0, 5);

            const isWorkDay = currentDay === userSchedule.day.toLowerCase();
            const isWorkHour = currentTime >= userSchedule.startTime && currentTime <= userSchedule.endTime;

            if (!isWorkDay) {
                attendanceStatus = "No es tu día laboral.";
            } else if (!isWorkHour) {
                attendanceStatus = "Fuera de horario laboral.";
            } else {
                // Si el día y hora son correctos, verifiquemos si la asistencia ya fue registrada.
                const attendance = await Attendance.findOne({ where: { userId: user.id, timestamp: { $gte: new Date().setHours(0, 0, 0, 0) } } });
                if (!attendance) {
                    attendanceStatus = "No has registrado tu asistencia hoy.";
                } else {
                    attendanceStatus = "Asistencia registrada.";
                }
            }
        }

        const plataformUser = await User.find().length
        const grantedPermissions = await Permission.find({status: 'Approved'}).length
        const noGrantedPermissions = await Permission.find({status: 'Rejected'}).length

        const allPermissions = await Permission.find({status: 'Pending'})
        const permissionsWithUsernames = [];

        // Iterar sobre cada permiso
        for (const permission of allPermissions) {
            // Buscar el usuario correspondiente
            const userDetails = await User.findOne({_id: permission.userId}); // Asegúrate de que userId sea un ObjectId válido

            // Agregar el permiso y el nombre de usuario al nuevo array
            permissionsWithUsernames.push({
                ...permission, // Copiar los datos del permiso
                username: userDetails ? userDetails.username : 'Usuario no encontrado' // Manejo de caso donde no se encuentra el usuario
            });
        }

        console.log(permissionsWithUsernames)



        // Contadores de asistencia

        res.render('home', { user, userSchedule, attendanceStatus, totalPresent, totalLate, totalAbsent, allUserSchedules, plataformUser, grantedPermissions, noGrantedPermissions, allPermissions: permissionsWithUsernames });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error al cargar los horarios.");
    }
});



app.post('/login', async (req, res) => {
    const { username, password } = req.body

    try {

        const user = await RegisterApp.login({ username, password })
        const token = jwt.sign({ id: user._id, username: user.username, isAdmin: user.isAdmin }, SECRET_JWT_KEY, {
            expiresIn: '1h'
        })


        res
            .cookie('access_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 1000 * 60 * 60
            })
            .send({ user })
    } catch (error) {
        res.status(401).send(error.message)

    }
})

app.get('/login', (req, res) => {
    res.render('login')
})

// Register
app.get('/register', (req, res) => {
    res.render('register')
})


app.post('/register', async (req, res) => {
    const { username, password } = req.body

    try {
        const id = await RegisterApp.create({ username, password })
        res.send({ id })
    } catch (error) {
        res.status(400).send(error.message)
    }
})


app.post('/logout', (req, res) => {
    res
        .clearCookie('access_token')
        .json({ message: 'Logout exitoso' })
    // redireccion
})

app.get('/permissions/logout', (req, res) => {
    res
        .clearCookie('access_token')
        .redirect('/')
        .json({ message: 'Logout exitoso' })
    // redireccion
})





//

app.get('/users', async (req, res) => {
    try {
        const usersWithSchedules = ScheduleAppUsers.getAllUsersWithSchedules();
        res.render('users', { users: usersWithSchedules })

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// 📌 Registro de asistencia [Horarios] //////////////////////////
app.post('/attendance', async (req, res) => {
    const { user } = req.session;
    if (!user) return res.redirect('/login');

    try {
        const now = new Date(); // Definir la variable now con la fecha y hora actuales

        // Verificar si ya se registró la asistencia hoy
        const attendance = await Attendance.findOne({
            userId: user.id,
            timestamp: { $gte: new Date(now.setHours(0, 0, 0, 0)).toISOString() } // Buscar solo la asistencia de hoy
        });

        if (attendance) {
            return res.status(400).send("Ya has registrado tu asistencia hoy.");
        }

        // Si no se ha registrado la asistencia, crear un nuevo registro
        const attendanceRegister = await Attendance.create({
            userId: user.id,
            timestamp: new Date().toISOString()  // Convertir la fecha a cadena
        });

        attendanceRegister.save()

        res.redirect('/');
    } catch (error) {
        console.error(error);
        res.status(500).send("Error al registrar la asistencia.");
    }
});








// Registro de asistencia [Horarios] /////////////////////

// 📌 Ver horario
app.get('/schedule', async (req, res) => {
    const { user } = req.session;
    if (!user || !user.isAdmin) return res.redirect('/login');



    try {
        const usersWithSchedules = await ScheduleAppUsers.getAllUsersWithSchedules();
        console.log(usersWithSchedules) // Obtener todos los usuarios con horarios
        res.render('schedule', { usersWithSchedules });
    } catch (error) {
        res.status(500).send(error.message);
    }
});


app.post('/schedule/:userId', async (req, res) => {
    const { userId } = req.params; // Obtén el ID del usuario de la URL
    console.log(userId);

    const { day, startTime, endTime } = req.body; // Obtén los datos del formulario
    const { user } = req.session;

    // Verificar si el usuario está autenticado y es administrador
    if (!user || !user.isAdmin) {
        return res.status(401).send('No autorizado');
    }

    console.log("admin id", user.id)

    try {
        // Verificar si ya existe un horario para este usuario en el día proporcionado
        const existingSchedule = await Schedule.findOne({ userId, day });
        if (existingSchedule) {
            return res.status(400).send('Ya existe un horario para este usuario en este día');
        }

        // Llamar al método para crear el horario
        // const updatedSchedule = await ScheduleApp.createSchedule({userId, day, startTime, endTime, isAdmin: user.isAdmin});
        const updatedSchedule = await ScheduleApp.createSchedule({
            userId,
            day,
            startTime,
            endTime,
            isAdmin: user.id // Aquí le pasamos el ID del administrador
        });

        // Redirigir a la página de horarios después de actualizar
        res.redirect('/schedule');
    } catch (error) {
        console.error('Error al actualizar el horario:', error); // Log del error para diagnóstico
        res.status(500).send(`Error interno: ${error.message}`);
    }
});







///////////////////////////////////////////////////////////



// Permisos //////////////////////////////////////////////


app.get('/permissions', (req, res) => {
    const { user } = req.session;
    if (!user) return res.redirect('/login');


    try {
        const permissions = Permission.find({ userId: user.id })
        console.log(Permission.find({}))
        res.render('permissions', { user, permissions });
    } catch (error) {
        console.error('No se encontraron permisos')
    }

});




app.post('/permissions', async (req, res) => {
    const { user } = req.session;
    if (!user) return res.status(401).send('No autorizado');

    const { reason, startDate, endDate } = req.body;

    try {
        await PermissionApp.requestPermission({ userId: user.id, reason, startDate, endDate });
        res.redirect('/');
    } catch (error) {
        res.status(400).send(error.message);
    }
});


app.delete('/permissions/:id', async (req, res) => {
    const { user } = req.session;
    if (!user) return res.status(401).send('No autorizado');

    const { id } = req.params;
    console.log(id)

    try {
        const permission = await Permission.findOne({ _id: id, userId: user.id });

        const deletePermission = await Permission.remove({ _id: id, userId: user.id })
        if (!deletePermission) return console.error('No se pudo Eliminar')

        res.redirect('/');
    } catch (error) {
        res.status(500).send('Error al eliminar el permiso');
    }
});


app.put('/permissions/:id', async (req, res) => {
    const { user } = req.session;
    if (!user) return res.status(401).send('No autorizado');

    if (!user.isAdmin) return res.status(401).send('No tienes permiso')

    const { id } = req.params;
    const { status } = req.body; // Estado nuevo: 'Accepted' o 'Rejected'

    try {
        const permission = await Permission.findOne({ _id: id });

        if (!permission) {
            return res.status(404).json({ success: false, message: 'Permiso no encontrado' });
        }

        permission.status = status; // Actualiza el estado del permiso
        await permission.save(); // Guarda los cambios

        res.json({ success: true, message: `Permiso ${status.toLowerCase()} correctamente` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al actualizar el permiso' });
    }
});









/////////////////////////////////////////////////

// 📌 Generar informe de asistencia
app.get('/report', async (req, res) => {
    const { user } = req.session;
    if (!user) return res.redirect('/login');

    const records = await ReportApp.generateAttendanceReport(user.id);
    res.render('report', { records });
});


//




app.listen(PORT, () => {
    console.log(`Corriendo puerto: ${PORT}`)
})




