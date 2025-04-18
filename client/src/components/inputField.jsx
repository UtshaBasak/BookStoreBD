import React from 'react';

const InputField = ({ label, id, name, type = "text", value, onChange, placeholder, required }) => (
    <div>
        <label htmlFor={id} className='block text-zinc-400 mb-2'>{label}</label>
        <input
            type={type} 
            id={id} 
            name={name} 
            value={value} 
            onChange={onChange}
            placeholder={placeholder} 
            required={required}
            className='w-full bg-zinc-700 text-zinc-100 p-3 rounded outline-none focus:ring-2 focus:ring-blue-500'
            autoComplete={type === 'password' ? 'current-password' : name === 'email' ? 'email' : 'on'}
        />
    </div>
);

export default InputField;
