import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Store, Check, X } from 'lucide-react';
import type { User, Shop, CreateUserDto } from '@ar-option/shared-types';

interface UsersViewProps {
  apiUrl: string;
  shops: Shop[];
}

export const UsersView: React.FC<UsersViewProps> = ({ apiUrl, shops }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Edit user shops modal
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedShopIds, setSelectedShopIds] = useState<number[]>([]);
  const [savingShops, setSavingShops] = useState<boolean>(false);

  // Add user modal
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [role, setRole] = useState<'admin' | 'manager' | 'cashier' | 'staff'>('staff');
  const [newShopIds, setNewShopIds] = useState<number[]>([]);
  const [creating, setCreating] = useState<boolean>(false);

  const fetchUsers = () => {
    setLoading(true);
    fetch(`${apiUrl}/auth/users`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load users');
        return res.json();
      })
      .then((data: User[]) => {
        setUsers(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchUsers();
  }, [apiUrl]);

  const handleOpenEditShops = (user: User) => {
    setEditingUser(user);
    setSelectedShopIds(user.assigned_shops?.map((s) => s.id) || []);
  };

  const toggleShopSelection = (shopId: number) => {
    setSelectedShopIds((prev) =>
      prev.includes(shopId) ? prev.filter((id) => id !== shopId) : [...prev, shopId]
    );
  };

  const handleSaveShops = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setSavingShops(true);
    try {
      const res = await fetch(`${apiUrl}/auth/users/${editingUser.id}/shops`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_ids: selectedShopIds }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to update shops');
      }

      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to save shop mapping');
    } finally {
      setSavingShops(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      alert('Please fill out all user fields.');
      return;
    }

    setCreating(true);
    try {
      const dto: CreateUserDto = {
        name: name.trim(),
        email: email.trim(),
        password: password.trim(),
        role,
        shop_ids: newShopIds,
      };

      const res = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to create user');
      }

      setShowAddModal(false);
      setName('');
      setEmail('');
      setPassword('');
      setNewShopIds([]);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Error creating user');
    } finally {
      setCreating(false);
    }
  };

  const eligibleShops = shops.filter((s) => !s.is_system);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg md:text-xl font-bold flex items-center space-x-2">
            <Users className="w-5 h-5 text-primary dark:text-primary-tint" />
            <span>User Management & Shop Mapping</span>
          </h2>
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-0.5">
            Rule 1: Users can belong to more than one shop through user-to-shop mapping.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="h-11 px-4 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary-hover transition-colors shadow-sm flex items-center justify-center space-x-1.5"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add User</span>
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-light-text-muted dark:text-dark-text-muted">
          Loading users...
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-danger/10 text-danger text-xs text-center">{error}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u) => (
            <div
              key={u.id}
              className="bg-light-surface dark:bg-dark-surface p-5 rounded-2xl border border-light-border dark:border-dark-border shadow-sm flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      u.role === 'admin'
                        ? 'bg-primary/10 text-primary dark:text-primary-tint'
                        : u.role === 'manager'
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted'
                    }`}
                  >
                    {u.role}
                  </span>
                  <span className="text-[11px] font-mono text-light-text-muted dark:text-dark-text-muted">
                    ID: #{u.id}
                  </span>
                </div>

                <h3 className="font-bold text-base mt-3">{u.name}</h3>
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted">{u.email}</p>

                <div className="mt-3 pt-3 border-t border-light-border dark:border-dark-border space-y-1.5">
                  <div className="text-[11px] font-semibold text-light-text-muted dark:text-dark-text-muted flex items-center space-x-1">
                    <Store className="w-3.5 h-3.5" />
                    <span>Assigned Shops:</span>
                  </div>

                  {u.role === 'admin' ? (
                    <span className="text-xs font-semibold text-primary dark:text-primary-tint">
                      All Shops (Superuser)
                    </span>
                  ) : u.assigned_shops && u.assigned_shops.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {u.assigned_shops.map((s) => (
                        <span
                          key={s.id}
                          className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border"
                        >
                          {s.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-danger font-medium">No shops assigned</span>
                  )}
                </div>
              </div>

              {u.role !== 'admin' && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEditShops(u)}
                    className="w-full h-9 rounded-xl text-xs font-semibold bg-light-surface-hover dark:bg-dark-surface-hover hover:bg-primary hover:text-on-primary transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <span>Manage Assigned Shops</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal 1: Edit Assigned Shops */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-light-surface dark:bg-dark-surface w-full max-w-md rounded-2xl border border-light-border dark:border-dark-border shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-light-border dark:border-dark-border pb-3">
              <div>
                <h3 className="font-bold text-sm md:text-base">Assign Shops</h3>
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                  User: {editingUser.name} ({editingUser.role})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 rounded-lg text-light-text-muted hover:text-light-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShops} className="space-y-4">
              <div className="space-y-2">
                {eligibleShops.map((shop) => {
                  const isChecked = selectedShopIds.includes(shop.id);
                  return (
                    <div
                      key={shop.id}
                      onClick={() => toggleShopSelection(shop.id)}
                      className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-colors ${
                        isChecked
                          ? 'border-primary bg-primary/5 dark:bg-primary/10'
                          : 'border-light-border dark:border-dark-border hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-xs">{shop.name}</div>
                        <div className="text-[10px] text-light-text-muted dark:text-dark-text-muted">
                          Code: {shop.code}
                        </div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                          isChecked
                            ? 'bg-primary border-primary text-on-primary'
                            : 'border-light-border dark:border-dark-border'
                        }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="h-11 px-4 rounded-xl text-xs font-semibold hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingShops}
                  className="h-11 px-5 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {savingShops ? 'Saving...' : 'Save Mapping'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Add User */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-light-surface dark:bg-dark-surface w-full max-w-md rounded-2xl border border-light-border dark:border-dark-border shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-light-border dark:border-dark-border pb-3">
              <h3 className="font-bold text-sm md:text-base flex items-center space-x-2">
                <UserPlus className="w-4 h-4 text-primary" />
                <span>Create New User</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-light-text-muted hover:text-light-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Arif Rahman"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. arif@aroption.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-focus-ring"
                >
                  <option value="staff">Staff</option>
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Administrator</option>
                </select>
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
                  disabled={creating}
                  className="h-11 px-5 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
