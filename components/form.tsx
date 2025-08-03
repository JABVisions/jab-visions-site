'use client';

import { useState } from 'react';

export default function Form() {
  const [formData, setFormData] = useState({
    fullName: '',
    role: '',
    character: '',
    email: '',
    phone: '',
    emergencyContact: '',
    emergencyNumber: '',
  });

  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prevState => ({ ...prevState, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const response = await fetch('https://script.google.com/macros/s/AKfycbyL8fjfH4T9Tcrcd7p2o9rrB9u4E2-O4EXynDgjdcmatNDtsfUOek-HAacNdqLrPBvxFg/exec', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      setSubmitted(true);
      setFormData({
        fullName: '',
        role: '',
        character: '',
        email: '',
        phone: '',
        emergencyContact: '',
        emergencyNumber: '',
      });
    } else {
      console.error('Form submission error:', await response.text());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl mx-auto bg-black bg-opacity-70 p-6 rounded-xl shadow-lg mt-10">
      {submitted ? (
        <p className="text-green-400 text-center">Thank you! Your information has been submitted.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input name="fullName" type="text" placeholder="Full Name" value={formData.fullName} onChange={handleChange} required className="p-3 rounded-md bg-zinc-900 text-white" />
            <select name="role" value={formData.role} onChange={handleChange} required className="p-3 rounded-md bg-zinc-900 text-white">
              <option value="">Are you applying for Cast or Crew?</option>
              <option value="Cast">Cast</option>
              <option value="Crew">Crew</option>
            </select>
            <input name="character" type="text" placeholder="Character Name (if applicable)" value={formData.character} onChange={handleChange} className="p-3 rounded-md bg-zinc-900 text-white col-span-2" />
            <input name="email" type="email" placeholder="Email" value={formData.email} onChange={handleChange} required className="p-3 rounded-md bg-zinc-900 text-white" />
            <input name="phone" type="tel" placeholder="Phone Number" value={formData.phone} onChange={handleChange} required className="p-3 rounded-md bg-zinc-900 text-white" />
            <input name="emergencyContact" type="text" placeholder="Emergency Contact Name (optional)" value={formData.emergencyContact} onChange={handleChange} className="p-3 rounded-md bg-zinc-900 text-white" />
            <input name="emergencyNumber" type="tel" placeholder="Emergency Phone Number (optional)" value={formData.emergencyNumber} onChange={handleChange} className="p-3 rounded-md bg-zinc-900 text-white" />
          </div>
          <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300">Submit</button>
        </>
      )}
    </form>
  );
}
