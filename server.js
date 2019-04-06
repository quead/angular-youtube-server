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
        // console.log(this.data);
        fs.writeFileSync(this.name, JSON.stringify(this.data));
    }

    update(sessionKey, row, data) {
        let sessionOBJ = this.data.sessions.find(findSession => findSession[sessionKey])[sessionKey]
        sessionOBJ[row] = data
        this.writeDB();
    }
};

var db = new Database('./db.json');

io.on('connection', function (socket) {
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
    
    socket.on('show_msg_everyone', (roomName, msg) => {
        io.to(roomName).emit('alert_msg', msg);
    })

    // socket.on('disconnect', function () {
    //     // console.log('disconnected');
    // });
 
    socket.on('join_session', (roomName) => {
        socket.join(roomName);
        console.log('joined in the '+ roomName);
        io.to(roomName).emit('alert_notify', 30);
    });

    socket.on('leave_session', (roomName) => {
        socket.leave(roomName);
        console.log('leaved the room '+ roomName);
        io.to(roomName).emit('alert_notify', 31);
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
