// File: components/RegisterForm.tsx
'use client';

import { useState } from 'react';

export default function RegisterForm() {
  const [formData, setFormData] = useState({
    fullName: '',
    castOrCrew: '',
    role: '',
    email: '',
    phone: '',
    emergencyContact: '',
    emergencyNumber: ''
  });
  const [status, setStatus] = useState<'idle'|'success'|'error'>('idle');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    console.log(`Field changed: ${name} -> ${value}`);
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting formData:', formData);
    setStatus('idle');

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      setStatus(response.ok ? 'success' : 'error');
      if (response.ok) {
        setFormData({ fullName: '', castOrCrew: '', role: '', email: '', phone: '', emergencyContact: '', emergencyNumber: '' });
      }
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl mx-auto">
      {/* Full Name */}
      <div className="flex flex-col">
        <label htmlFor="fullName" className="mb-1 text-white">Full Name</label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          value={formData.fullName}
          onChange={handleChange}
          placeholder="Full Name"
          required
          className="p-3 bg-white text-black border border-gray-300 rounded"
        />
      </div>

      {/* Cast or Crew? */}
      <div className="flex flex-col">
        <label htmlFor="castOrCrew" className="mb-1 text-white">Cast or Crew?</label>
        <select
          id="castOrCrew"
          name="castOrCrew"
          value={formData.castOrCrew}
          onChange={handleChange}
          required
          className="p-3 bg-white text-black border border-gray-300 rounded"
        >
          <option value="" disabled>Select Cast or Crew</option>
          <option value="Cast">Cast</option>
          <option value="Crew">Crew</option>
        </select>
      </div>

      {/* Role */}
      <div className="flex flex-col">
        <label htmlFor="role" className="mb-1 text-white">Role</label>
        <input
          id="role"
          name="role"
          type="text"
          value={formData.role}
          onChange={handleChange}
          placeholder="Role"
          required
          className="p-3 bg-white text-black border border-gray-300 rounded"
        />
      </div>

      {/* Email */}
      <div className="flex flex-col">
        <label htmlFor="email" className="mb-1 text-white">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="Email"
          required
          className="p-3 bg-white text-black border border-gray-300 rounded"
        />
      </div>

      {/* Phone */}
      <div className="flex flex-col">
        <label htmlFor="phone" className="mb-1 text-white">Phone</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          value={formData.phone}
          onChange={handleChange}
          placeholder="Phone"
          required
          className="p-3 bg-white text-black border border-gray-300 rounded"
        />
      </div>

      {/* Emergency Contact (optional) */}
      <div className="flex flex-col">
        <label htmlFor="emergencyContact" className="mb-1 text-white">Emergency Contact (optional)</label>
        <input
          id="emergencyContact"
          name="emergencyContact"
          type="text"
          value={formData.emergencyContact}
          onChange={handleChange}
          placeholder="Emergency Contact"
          className="p-3 bg-white text-black border border-gray-300 rounded"
        />
      </div>

      {/* Emergency Number (optional) */}
      <div className="flex flex-col">
        <label htmlFor="emergencyNumber" className="mb-1 text-white">Emergency Number (optional)</label>
        <input
          id="emergencyNumber"
          name="emergencyNumber"
          type="tel"
          value={formData.emergencyNumber}
          onChange={handleChange}
          placeholder="Emergency Number"
          className="p-3 bg-white text-black border border-gray-300 rounded"
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded"
      >
        Submit
      </button>

      {/* Status Messages */}
      {status === 'success' && (
        <p className="text-green-400 text-center">Submitted successfully!</p>
      )}
      {status === 'error' && (
        <p className="text-red-500 text-center">Submission failed. Please try again.</p>
      )}
    </form>
  );
}