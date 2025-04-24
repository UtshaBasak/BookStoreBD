import React from 'react';
import { BrowserRouter ,Routes, Route} from 'react-router-dom';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Payment from './pages/Payment'; 
import AddBooks from './pages/AddBook';
import AdminPanel from './pages/AdminPanel';
import Homepage from './pages/Homepage';
import Profile from './pages/Profile';
import UpdateProfile from './pages/UpdateProfile';


export default function App() {
  return <BrowserRouter><Routes>
    <Route path="/" element={<Homepage />} />
    <Route path="/sign-in" element={<SignIn/>} />
    <Route path="/sign-up" element={<SignUp/>} />
    <Route path="/payment" element={<Payment/>} />
    <Route path="/add-book" element={<AddBooks/>} />
    <Route path="/admin/*" element={<AdminPanel />} />
    <Route path="/profile" element={<Profile />} />
    <Route path="/update-profile" element={<UpdateProfile />} />
    <Route path="*" element={<h1>404 Not Found</h1>} />

  </Routes></BrowserRouter>;
};
