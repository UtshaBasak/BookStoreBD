import { io } from 'socket.io-client';

const socket = io('http://localhost:1015', {
    autoConnect: true,
    reconnection: true
});

export default socket;
