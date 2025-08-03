'use client';
import React, { useState } from 'react';

const Form = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    availability: '',
    headshotUrl: '',
    resumeUrl: '',
    emergencyContact: '',
    emergencyNumber: '',
  });

  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('idle');

    try {
      const response = await fetch('https://script.google.com/macros/s/AKfycby4wgM7brYEIxPVyvStr3nd9bZF4_0P_hna7Bv8WJqqDMAwfk8sbFspRDqnHwMayr-r0A/exec', {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      setFormData({
        name: '',
        email: '',
        phone: '',
        role: '',
        availability: '',
        headshotUrl: '',
        resumeUrl: '',
        emergencyContact: '',
        emergencyNumber: '',
      });

      setStatus('success');
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-6 bg-black/30 p-6 rounded-xl shadow-md">
      <h2 className="text-xl font-semibold text-white mb-2 tracking-wide">Registration Form</h2>

      {[
        { label: 'Full Name', name: 'name', required: true },
        { label: 'Email', name: 'email', required: true },
        { label: 'Phone Number', name: 'phone', required: true },
        { label: 'What Role Are You Applying For?', name: 'role', required: true },
        { label: 'General Availability (Aug - Sep)', name: 'availability', required: true },
        { label: 'Headshot URL (Optional)', name: 'headshotUrl', required: false },
        { label: 'Resume URL (Optional)', name: 'resumeUrl', required: false },
        { label: 'Emergency Contact (Optional)', name: 'emergencyContact', required: false },
        { label: 'Emergency Number (Optional)', name: 'emergencyNumber', required: false },
      ].map(({ label, name, required }) => (
        <div key={name} className="flex flex-col">
          <label htmlFor={name} className="text-sm text-gray-300 mb-1">{label}</label>
          <input
            type="text"
            id={name}
            name={name}
            value={formData[name as keyof typeof formData]}
            onChange={handleChange}
            required={required}
            className="rounded p-2 bg-white/90 text-black text-sm focus:outline-none"
          />
        </div>
      ))}

      <button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-md">
        Submit
      </button>

      {status === 'success' && <p className="text-green-400 text-sm mt-2">Submission successful. Thank you!</p>}
      {status === 'error' && <p className="text-red-500 text-sm mt-2">Something went wrong. Please try again.</p>}
    </form>
  );
};

export default Form;
