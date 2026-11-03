import React, { useState } from 'react';
import { Store, Plus, CheckCircle2, AlertCircle, X, Pencil } from 'lucide-react';
import type { Shop } from '@ar-option/shared-types';
import { apiFetch } from '../lib/api';
import { Sheet } from './Sheet';

interface ShopsViewProps {
  shops: Shop[];
  onRefreshShops: () => void;
  apiUrl: string;
}

export const ShopsView: React.FC<ShopsViewProps> = ({
  shops,
  onRefreshShops,
  apiUrl,
}) => {
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<Shop | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const openEdit = (shop: Shop) => {
    setEditing(shop);
    setEditName(shop.name);
    setEditError(null);
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const clean = editName.replace(/\s+/g, ' ').trim();
    if (!clean) {
      setEditError('Shop name is required.');
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await apiFetch(`${apiUrl}/shops/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not rename the shop.');
      setSuccess(`Shop renamed to '${data.name}'.`);
      setEditing(null);
      onRefreshShops();
    } catch (err: any) {
      setEditError(err.message || 'Could not rename the shop.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim() || !code.trim()) {
      setError('Shop name and code are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(`${apiUrl}/shops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), code: code.trim().toUpperCase() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to create shop');
      }

      setSuccess(`Shop '${data.name}' created! Default cash account CASH_${data.code} automatically provisioned.`);
      setName('');
      setCode('');
      setShowAddModal(false);
      onRefreshShops();
    } catch (err: any) {
      setError(err.message || 'Failed to create shop');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg md:text-xl font-bold flex items-center space-x-2">
            <Store className="w-5 h-5 text-primary dark:text-primary-tint" />
            <span>Shop Management</span>
          </h2>
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-0.5">
            Rule 1: Physical selling locations. Each shop owns its cash accounts, stock, sales, and registers.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="h-11 px-4 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary-hover transition-colors shadow-sm flex items-center justify-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Shop</span>
        </button>
      </div>

      {success && (
        <div className="p-3.5 rounded-xl bg-success/10 text-success-text-light dark:text-success text-xs flex items-center space-x-2 border border-success/20">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Grid of Shops */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {shops.map((shop) => (
          <div
            key={shop.id}
            className="bg-light-surface dark:bg-dark-surface p-5 rounded-2xl border border-light-border dark:border-dark-border shadow-sm flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border">
                  {shop.code}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    shop.is_active
                      ? 'bg-success/10 text-success-text-light dark:text-success'
                      : 'bg-light-text-muted/10 text-light-text-muted'
                  }`}
                >
                  {shop.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <h3 className="font-bold text-base mt-3">{shop.name}</h3>
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
                Shop ID: #{shop.id} • Cash Account: CASH_{shop.code}
              </p>
            </div>

            <div className="pt-3 border-t border-light-border dark:border-dark-border flex items-center justify-between text-xs text-light-text-muted dark:text-dark-text-muted">
              <span>{shop.is_system ? 'System Location' : 'Physical Retail Store'}</span>
              {!shop.is_system && (
                <button
                  type="button"
                  onClick={() => openEdit(shop)}
                  aria-label={`Edit ${shop.name}`}
                  className="h-11 px-3 -my-2 -mr-2 rounded-xl font-semibold text-primary dark:text-primary-tint hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover flex items-center space-x-1.5"
                >
                  <Pencil className="w-4 h-4" />
                  <span>Edit</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <Sheet
          title="Edit Shop"
          onClose={() => setEditing(null)}
          testId="edit-shop-sheet"
          footer={
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setEditing(null)} className="h-11 px-4 rounded-xl text-sm font-semibold bg-light-surface-hover dark:bg-dark-surface-hover">
                Cancel
              </button>
              <button type="submit" form="edit-shop-form" disabled={savingEdit} className="h-11 px-5 rounded-xl text-sm font-bold bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50">
                {savingEdit ? 'Saving...' : 'Save'}
              </button>
            </div>
          }
        >
          <form id="edit-shop-form" onSubmit={handleRename} className="space-y-4">
            {editError && (
              <div role="alert" className="p-3 rounded-xl bg-danger/10 text-danger-text-light dark:text-danger text-sm flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}
            <div>
              <label htmlFor="edit-shop-name" className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                Shop Name
              </label>
              <input
                id="edit-shop-name"
                type="text"
                maxLength={100}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full h-11 px-3 rounded-xl text-sm bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </div>
            <div>
              <span className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">Shop Code</span>
              <div className="h-11 px-3 rounded-xl text-sm font-mono flex items-center bg-light-surface-hover/60 dark:bg-dark-surface-hover/60 border border-light-border dark:border-dark-border text-light-text-muted dark:text-dark-text-muted">
                {editing.code}
              </div>
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
                The code cannot change, because receipts already carry it ({editing.code}-000001). The shop's cash, card and bKash accounts take the new name.
              </p>
            </div>
          </form>
        </Sheet>
      )}

      {/* Add Shop Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-light-surface dark:bg-dark-surface w-full max-w-md rounded-2xl border border-light-border dark:border-dark-border shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-light-border dark:border-dark-border pb-3">
              <h3 className="font-bold text-sm md:text-base flex items-center space-x-2">
                <Store className="w-4 h-4 text-primary" />
                <span>Create New Retail Shop</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-light-text-muted hover:text-light-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-danger/10 text-danger text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateShop} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                  Shop Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dhanmondi Flagship"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                  Shop Code (Unique identifier)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DHM-01"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl text-xs font-mono uppercase bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
                <p className="text-[11px] text-light-text-muted dark:text-dark-text-muted mt-1">
                  Used for short sequential receipts (Rule 7, e.g. DHM-000142) and shop cash accounts.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="h-11 px-4 rounded-xl text-xs font-semibold hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-11 px-5 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Shop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
