import React, { useState } from 'react';
import { UserPlus, AlertCircle } from 'lucide-react';
import type { Contact } from '@ar-option/shared-types';
import { Sheet } from '../Sheet';
import { apiFetch } from '../../lib/api';

interface CustomerModalProps {
  apiUrl: string;
  onClose: () => void;
  onCreated: (contact: Contact) => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({ apiUrl, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError('Name and phone number are required.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`${apiUrl}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Could not save contact.');
      }
      onCreated(data);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Add Customer"
      onClose={onClose}
      testId="add-customer-modal"
      footer={
        <button
          type="button"
          disabled={busy || !name.trim() || !phone.trim()}
          onClick={handleSubmit}
          className="w-full h-12 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          {busy ? 'Saving...' : 'Save & Select Customer'}
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="flex items-center gap-2 p-3 rounded-xl text-xs bg-danger/10 text-danger border border-danger/20">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="cust-name" className="block text-xs font-semibold mb-1">
            Customer Name <span className="text-danger">*</span>
          </label>
          <input
            id="cust-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tanvir Ahmed"
            className="w-full h-11 px-3 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-sm"
          />
        </div>

        <div>
          <label htmlFor="cust-phone" className="block text-xs font-semibold mb-1">
            Mobile Number <span className="text-danger">*</span>
          </label>
          <input
            id="cust-phone"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 01711223344"
            className="w-full h-11 px-3 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-sm font-mono"
          />
        </div>

        <div>
          <label htmlFor="cust-address" className="block text-xs font-semibold mb-1">
            Delivery / Street Address (optional)
          </label>
          <textarea
            id="cust-address"
            rows={2}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="House, Road, Area, City"
            className="w-full p-3 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-sm"
          />
        </div>

        <div>
          <label htmlFor="cust-email" className="block text-xs font-semibold mb-1">
            Email (optional)
          </label>
          <input
            id="cust-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            className="w-full h-11 px-3 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-sm"
          />
        </div>
      </form>
    </Sheet>
  );
};

