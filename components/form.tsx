'use client';
import { useState } from 'react';

export default function Form() {
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('idle');

    try {
      await fetch(
        'https://script.google.com/macros/s/AKfycbyL8fjfH4T9Tcrcd7p2o9rrB9u4E2-O4EXynDgjdcmatNDtsfUOek-HAacNdqLrPBvxFg/exec',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        }
      );
      setStatus('success');
      setFormData({
        fullName: '',
        castOrCrew: '',
        role: '',
        email: '',
        phone: '',
        emergencyContact: '',
        emergencyNumber: ''
      });
    } catch {
      setStatus('error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl mx-auto">
      <input
        type="text"
        name="fullName"
        value={formData.fullName}
        onChange={handleChange}
        placeholder="Full Name"
        required
        className="w-full p-2 border rounded"
      />

      <input
        type="text"
        name="castOrCrew"
        value={formData.castOrCrew}
        onChange={handleChange}
        placeholder="Cast or Crew?"
        required
        className="w-full p-2 border rounded"
      />

      <input
        type="text"
        name="role"
        value={formData.role}
        onChange={handleChange}
        placeholder="Role"
        required
        className="w-full p-2 border rounded"
      />

      <input
        type="email"
        name="email"
        value={formData.email}
        onChange={handleChange}
        placeholder="Email"
        required
        className="w-full p-2 border rounded"
      />

      <input
        type="tel"
        name="phone"
        value={formData.phone}
        onChange={handleChange}
        placeholder="Phone"
        required
        className="w-full p-2 border rounded"
      />

      <input
        type="text"
        name="emergencyContact"
        value={formData.emergencyContact}
        onChange={handleChange}
        placeholder="Emergency Contact (optional)"
        className="w-full p-2 border rounded"
      />

      <input
        type="tel"
        name="emergencyNumber"
        value={formData.emergencyNumber}
        onChange={handleChange}
        placeholder="Emergency Number (optional)"
        className="w-full p-2 border rounded"
      />

      <button
        type="submit"
        className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700"
      >
        Submit
      </button>

      {status === 'success' && (
        <p className="text-green-400 text-center">Submitted successfully!</p>
      )}
      {status === 'error' && (
        <p className="text-red-500 text-center">Submission failed. Please try again.</p>
      )}
    </form>
  );
}
