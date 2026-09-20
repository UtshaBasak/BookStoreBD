import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
    sender: {
        type: String,
        required: true
    },
    receiver: {
        type: String, 
        required: true
    },
    message: {
        type: String,
        required: true
    },
    image: {
        type: String,  // Will store base64 encoded image
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    read: {
        type: Boolean,
        default: false
    }
}, { timestamps: true }); 

chatSchema.index({ sender: 1, receiver: 1, timestamp: -1 });

const ChatMessage = mongoose.models.ChatMessage || mongoose.model('ChatMessage', chatSchema);
export default ChatMessage;
