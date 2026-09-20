import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config/api.js';

const socket = io(API_BASE_URL, {
    autoConnect: true,
    reconnection: true
});

export default socket;
