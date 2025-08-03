'use client';

import Navbar from '@/components/Navbar';
import RegisterForm from '@/components/RegisterForm';

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-gray-100">
      <Navbar />
      <section className="py-12 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-center text-neutral-800 mb-8">
            Cast & Crew Registration
          </h1>
          <RegisterForm />
        </div>
      </section>
    </main>
  );
}
