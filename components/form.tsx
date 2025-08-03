'use client';
import { useState } from 'react';

export default function Form() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: '',
    availability: '',
    comments: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Registration submitted successfully!');
    console.log(formData); // replace this with actual backend submission
  };

  return (
    <form onSubmit={handleSubmit} className="bg-neutral-800 p-6 rounded-lg shadow-lg space-y-4">
      <div>
        <label className="block mb-1 text-sm font-medium">Full Name</label>
        <input
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 bg-neutral-900 border border-zinc-700 rounded text-white"
        />
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium">Email</label>
        <input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 bg-neutral-900 border border-zinc-700 rounded text-white"
        />
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium">Role on Set</label>
        <input
          name="role"
          value={formData.role}
          onChange={handleChange}
          className="w-full px-3 py-2 bg-neutral-900 border border-zinc-700 rounded text-white"
        />
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium">Availability</label>
        <input
          name="availability"
          value={formData.availability}
          onChange={handleChange}
          className="w-full px-3 py-2 bg-neutral-900 border border-zinc-700 rounded text-white"
        />
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium">Additional Comments</label>
        <textarea
          name="comments"
          value={formData.comments}
          onChange={handleChange}
          rows={3}
          className="w-full px-3 py-2 bg-neutral-900 border border-zinc-700 rounded text-white"
        />
      </div>

      <button
        type="submit"
        className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-2 rounded"
      >
        Submit
      </button>
    </form>
  );
}
