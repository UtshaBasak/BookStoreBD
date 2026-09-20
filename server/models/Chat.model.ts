import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

const chatSchema = new Schema({
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

export type ChatMessageAttributes = InferSchemaType<typeof chatSchema>;
export type ChatMessageDocument = HydratedDocument<ChatMessageAttributes>;

const ChatMessage = defineModel<ChatMessageAttributes>('ChatMessage', chatSchema);
export default ChatMessage;
