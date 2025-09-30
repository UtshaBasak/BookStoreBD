import { io } from 'socket.io-client';

const socket = io('https://bookstorebd.onrender.com', {
    autoConnect: true,
    reconnection: true
});

export default socket;
