import dbLocal from "db-local";
import crypto from "node:crypto"
import bcrypt from "bcrypt"
import { SALT_ROUNDS } from "./config.js";

const { Schema } = new dbLocal({ path: './db' })



const Session = Schema('Session', {
	_id: {type: String, required: true},
	user: {type: String, required: true},
	expires: {type: String, rquired: true}
})

const User = Schema('User', {
	_id: { type: String, required: true },
	username: { type: String, required: true },
	password: { type: String, required: true }
})

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

		const { password: _, ...publicUser} = user

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