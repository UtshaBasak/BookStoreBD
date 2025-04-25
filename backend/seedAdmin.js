const mongoose = require('mongoose');
const User = require('./models/User');

async function seedAdmin() {
    await mongoose.connect('mongodb://localhost:27017/yourdbname');
    const email = 'utsha23basak@gmail.com';
    let user = await User.findOne({ email });
    if (!user) {
        user = new User({ email, password: '***REMOVED***', isAdmin: true, name: 'Admin User' });
        await user.save();
        console.log('Admin user created');
    } else if (!user.isAdmin) {
        user.isAdmin = true;
        await user.save();
        console.log('Admin user updated');
    } else {
        console.log('Admin user already exists');
    }
    mongoose.disconnect();
}
seedAdmin();
