import express from 'express'
import { PORT, SECRET_JWT_KEY } from './config.js'
import { AttendanceApp, Permission, PermissionApp, RegisterApp, ReportApp, ScheduleApp, Schedule, ScheduleAppUsers } from './registerDB.js'
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



app.get('/', (req, res) => {
    const { user } = req.session
    if (!user) return res.redirect('/login')

    res.render('home', { user })
})


app.post('/login', async (req, res) => {
    const { username, password } = req.body

    try {

        const user = await RegisterApp.login({ username, password })
        const token = jwt.sign({ id: user._id, username: user.username, isAdmin: user.isAdmin}, SECRET_JWT_KEY, {
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





//

app.get('/users', async (req, res) => {
    try {
        const usersWithSchedules = ScheduleAppUsers.getAllUsersWithSchedules();
        res.render('users', { users: usersWithSchedules })

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// 📌 Registro de asistencia [Horarios]
app.post('/attendance', async (req, res) => {
    const { user } = req.session;
    if (!user) return res.status(401).send('No autorizado');
    
    try {
        await AttendanceApp.markAttendance({ userId: user.id });
        res.redirect('/');
    } catch (error) {
        res.status(400).send(error.message);
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
        res.render('permissions', { permissions });
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

        const deletePermission = await Permission.remove({_id: id, userId: user.id})
        if (!deletePermission) return console.error('No se pudo Eliminar')
        
        res.redirect('/');
    } catch (error) {
        res.status(500).send('Error al eliminar el permiso');
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




