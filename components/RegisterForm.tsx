'use client';

import { useState } from 'react';

export default function RegisterForm() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    role: 'Cast',
    character: '',
    email: '',
    phone: '',
    emergencyContact: '',
    emergencyNumber: '',
    headshot: '',
    resume: '',
    idUpload: '',
    nda: '',
    agreeToTerms: false,
  });

  const webhookUrl = 'https://script.google.com/macros/s/AKfycbzza_t93CjPsdPjea_CjY4zwJjusqrk_dAckfv7zFHMn2uuotsFOI-BNvyXqnyTG5a8Aw/exec';

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: JSON.stringify(formData),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      setSubmitted(true);
      setFormData({
        fullName: '',
        role: 'Cast',
        character: '',
        email: '',
        phone: '',
        emergencyContact: '',
        emergencyNumber: '',
        headshot: '',
        resume: '',
        idUpload: '',
        nda: '',
        agreeToTerms: false,
      });
    }
  };

  if (submitted) {
    return (
      <div className="p-8 text-green-600 font-semibold text-lg">
        ✅ Thank you! Your registration has been received.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-6 space-y-6 bg-white shadow-md rounded-md">
      <h2 className="text-2xl font-bold">Cast & Crew Registration</h2>

      <input name="fullName" value={formData.fullName} onChange={handleChange} placeholder="Full Name" required className="w-full border px-4 py-2 rounded" />

      <select name="role" value={formData.role} onChange={handleChange} className="w-full border px-4 py-2 rounded">
        <option value="Cast">Cast</option>
        <option value="Crew">Crew</option>
      </select>

      <input name="character" value={formData.character} onChange={handleChange} placeholder="Character (if applicable)" className="w-full border px-4 py-2 rounded" />

      <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="Email" required className="w-full border px-4 py-2 rounded" />

      <input name="phone" value={formData.phone} onChange={handleChange} placeholder="Phone Number" required className="w-full border px-4 py-2 rounded" />

      <input name="emergencyContact" value={formData.emergencyContact} onChange={handleChange} placeholder="Emergency Contact Name" className="w-full border px-4 py-2 rounded" />

      <input name="emergencyNumber" value={formData.emergencyNumber} onChange={handleChange} placeholder="Emergency Contact Number" className="w-full border px-4 py-2 rounded" />

      <input name="headshot" value={formData.headshot} onChange={handleChange} placeholder="Headshot URL (Dropbox, Google Drive, etc.)" required className="w-full border px-4 py-2 rounded" />

      <input name="resume" value={formData.resume} onChange={handleChange} placeholder="Resume URL (optional)" className="w-full border px-4 py-2 rounded" />

      <input name="idUpload" value={formData.idUpload} onChange={handleChange} placeholder="Government ID URL (optional)" className="w-full border px-4 py-2 rounded" />

      <input name="nda" value={formData.nda} onChange={handleChange} placeholder="NDA Upload URL (if signed)" className="w-full border px-4 py-2 rounded" />

      <label className="flex items-center space-x-2">
        <input type="checkbox" name="agreeToTerms" checked={formData.agreeToTerms} onChange={handleChange} required />
        <span>I agree to the terms and NDA policy.</span>
      </label>

      <button type="submit" className="bg-black text-white px-6 py-2 rounded hover:bg-gray-800 transition">
        Submit
      </button>
    </form>
  );
}
