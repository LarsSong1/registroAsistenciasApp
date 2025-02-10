import express from 'express'
import { PORT, SECRET_JWT_KEY } from './config.js'
import { RegisterApp } from './registerDB.js'
import jwt from 'jsonwebtoken'
import cookieParser from 'cookie-parser'

const app = express()

// ejs es para usar html
app.set('view engine', 'ejs')

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



app.get('/', (req, res) => {
    const { user } = req.session
    if (!user) return res.redirect('/login')

    res.render('home', {user})
})


app.post('/login', async (req, res) => {
    const { username, password } = req.body

    try {

        const user = await RegisterApp.login({ username, password })
        const token = jwt.sign({ id: user._id, username: user.username }, SECRET_JWT_KEY, {
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

app.get('/login', (req, res)=> {
    res.render('login')
})

// Register
app.get('/register', (req, res)=> {
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
        .json({message: 'Logout exitoso'})
        // redireccion
})






app.listen(PORT, () => {
    console.log(`Corriendo puerto: ${PORT}`)
})




