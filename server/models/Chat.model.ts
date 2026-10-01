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
    /*
     * Not `required`: Mongoose's required check rejects an empty string, which
     * would refuse a message carrying only a picture. The route insists on one
     * or the other.
     */
    message: {
        type: String,
        default: ''
    },
    /**
     * A base64 data URI. Served by address from /chat/messages/:id/image
     * rather than sent inline, so a thread does not carry its pictures.
     */
    image: {
        type: String,
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
