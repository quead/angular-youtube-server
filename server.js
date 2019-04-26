const YOUR_HOST = 'https://habarnam.io';
var fs = require('fs');
let sv = require('socket.io');
let io = sv.listen(8889);
io.origins((origin, callback) => {
    if (origin !== YOUR_HOST) {
        return callback('origin not allowed', false);
    }
    callback(null, true);
});

global.guid = function () {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }
    return s4() + s4() + s4();
}

class Session {
    constructor(data) {
        this.data = data;
    }

    exists(name) {
        return this.data.indexOf(name) == -1 ? false : true;
    }

    create() {
        let guid = global.guid();
        let clearSession = {};
        clearSession[guid] = {playlist: [], player: []}
        this.data.push(clearSession);
        return guid;
    }
};

class Database {
    constructor(name){
        this.name = name;

        this.data = {
            sessions: []
        };

        if (fs.existsSync(name)) {
            let data = JSON.parse(fs.readFileSync(this.name));
            for (let i in this.data) {
                if (typeof data[i] == 'undefined') {
                    data[i] = this.data[i];
                }
            }
            this.data = data;
        } else {
            this.writeDB();
        }

        this.session = new Session(this.data.sessions);

        return this;
    }

    writeDB() {
        fs.writeFileSync(this.name, JSON.stringify(this.data));
    }

    update(sessionKey, row, data) {
        let sessionOBJ = this.data.sessions.find(findSession => findSession[sessionKey])[sessionKey]
        sessionOBJ[row] = data
        this.writeDB();
    }
};

var db = new Database('./db.json');

class Client {
    constructor() {
        this.clients = [];
    }

    processData(data) {
        this.clients.push(data);
    }

    getClients() {
        return this.clients;
    }

    existClient(clientName) {
        const client = this.clients.filter(client => client.name === clientName);
        console.log(client);
        return client;
    }

    removeClient(clientID) {
        const index = this.clients.indexOf(clientID);
        this.clients.splice(index, 1);
    }
}

var newClient = new Client();

setInterval(() => {
    console.log(newClient.getClients());
}, 5000);

io.on('connection', function (socket) {
    let clientData = {
        id: '',
        name: '',
        room: ''
    }

    socket.on('disconnect', () => {
        if (clientData.id !== '') {
            socket.leave(clientData.room);
            io.to(clientData.room).emit('user_left', clientData.name);
            newClient.removeClient(clientData.id);
        }
    });
    
    socket.on('join_session', ({session, name}, callback) => {
        clientData.name = name;
        clientData.room = session;
        clientData.id = socket.id;
        statusData = 'OK';

        if (newClient.existClient(clientData.name).length > 0) {
            clientData.name = clientData.id;
            statusData = 'USERNAME_EXIST';
        } else if (clientData.name === '' || clientData.name == null) {
            clientData.name = clientData.id;
            statusData = 'USERNAME_EMPTY';
        } else {
            clientData.name = name;
        }

        socket.join(clientData.room);
        newClient.processData(clientData);

        callback({
            client: clientData,
            status: statusData
        })
    });

    socket.on('leave_session', (roomName) => {
        socket.leave(roomName);
        io.to(roomName).emit('user_left', clientData.name);
        newClient.removeClient(clientData.id);
    });

    socket.on('change_username', ({name}, callback) => {
        statusData = '';
        
        if (newClient.existClient(clientData.name).length < 1) {
            console.log(name);
            statusData = 'OK';
        }

        callback({
            status: statusData
        })
    });

    // socket.emit('get_session', '') - create new session
    // socket.emit('get_session, {session: 'HASH'}) - get session key
    socket.on('get_session', (data, callback) => {
        try {
            let status, session;
            if (typeof data.session != 'undefined') {
                let availableSession = db.session.data.find(findSession => findSession[data.session]);
                if (availableSession) {
                    session = availableSession;
                    status = 'SESSION_OK';
                } else {
                    session = data.session;
                    status = 'SESSION_NOT_FOUND';
                }
            } else {
                session = db.session.create();
                db.writeDB();
                status = 'SESSION_NEW';
            }

            callback({
                session: session,
                status: status
            })
        } catch (e) {
            console.log(e);
        }
    });
    // socket.emit('update_session', {
    //     session: 'HASH',
    //     row: 'playlist/player',
    //     data: []
    // }) - create new session
    socket.on('update_session', ({session, row, data}, callback) => {
        try {
            let status;
            let availableSession = db.session.data.find(findSession => findSession[session]);
            if (availableSession) {
                db.update(session, row, data);
                status = 'SESSION_UPDATED';
            } else {
                status = 'SESSION_NOT_UPDATED';
            }

            callback({
                session: session,
                status: status
            })
        } catch (e) {
            console.log(e);
        }
    });

    socket.on('update_player', (data) => {
        io.to(data.roomName).emit('event_trigger', data);
    });

    socket.on('update_playlist', (roomName) => {
        let availableSession = db.session.data.find(findSession => findSession[roomName]);
        if (availableSession) {
            io.to(roomName).emit('download_playlist', availableSession);
        }
        io.to(roomName).emit('alert_msg', `I want to update ${roomName}`);
    });
});