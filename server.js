'use strict';

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const sp = require('synchronized-promise');

app.use(express.static('public'));

const config = require('./config/db.json');
const mysql = require('mysql');
const connection = mysql.createConnection({
  host     : config.host,
  user     : config.dbuser,
  password : config.dbpass,
  database : config.dbname
});

const roomExistsPromise = function(roomId) {
  return new Promise(function(resolve, reject) {
    connection.query("select 1 from rooms where roomId = '"+ roomId +"' LIMIT 1", function (error, results, fields) {
      resolve(results);
    });
  });
}

const roomExists = function(roomId) {
  const searchF = sp(roomExistsPromise);
  var res = searchF(roomId);
  return !!res.length;
}

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/html/index.html');
});

app.get('/client', function(req, res) {
  if(!req.query.roomId || !req.query.seat) {
    res.redirect('/?invalidRoomOrSeat=true');
  } else if(!roomExists(req.query.roomId)) {
    res.redirect('/?invalidRoomOrSeat=true');
  } else {
    res.sendFile(__dirname + '/html/client.html');
  }
});

app.get('/admin', function(req, res) {
  if(!req.query.roomId) {
    res.end('Invalid room');
  }
  else if (roomExists(req.query.roomId)) {
    res.end('Room already exist. Refresh to retry.');
  } else if(!req.query.seats || req.query.seats > 100 || req.query.seats < 1) {
    res.end('Invalid seats count.');
  } else {
    connection.query("INSERT INTO rooms (roomId) VALUES ('"+ req.query.roomId +"')");
    const roomId = '/' + req.query.roomId;
    let connections = [];
    const nsp = io.of(roomId);
    nsp.on('connection', function(socket) {
      console.log('someone connected');
      socket.on('disconnect', function() {
        const seat = connections[socket.id];
        nsp.emit('disable-seat', seat);
        console.log('user disconnected');
        connections[socket.id] = null;
      });
      socket.on('new-client', function(seat) {
        nsp.emit('enable-seat', seat);
        connections[socket.id] = seat;
      });
      socket.on('color', function(msg) {
        nsp.emit(msg.seat, msg.color);
      });
      socket.on('exit', function() {
        connection.query("DELETE FROM rooms WHERE roomId = '"+ req.query.roomId +"' LIMIT 1");
        nsp.emit('serverend');
      });
    });
    res.sendFile(__dirname + '/html/admin.html');
  }
});

http.listen(3000, function() {
  console.log('listening on *:3000');
});
