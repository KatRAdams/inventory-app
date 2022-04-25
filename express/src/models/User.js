const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        unique: true,
        required: true
    },
    username: {
        type: String,
        unique: true,
        required: true
    },
    displayName: {
        type: String,
        required: true
    },
    uuid: {
        type: String,
        unique: true,
        required: true,
        //Collision probability calculator: https://zelark.github.io/nano-id-cc/
        default: () => nanoid(10)
    }
});

mongoose.model('User', userSchema);