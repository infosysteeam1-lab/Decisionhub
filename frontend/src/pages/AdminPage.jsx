/**
 * DecisionHub - Collaborative Decision-Making & Community Polling Platform
 *
 * File: AdminPage.jsx
 * Architecture Tier: Page Component (View Layer)
 * Path: frontend/src/pages/AdminPage.jsx
 *
 * Purpose:
 *   Platform administration console providing user moderation, role assignments, system health indicators, and platform settings.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import {
  getAllUsersAdminApi,
  banUserAdminApi,
  unbanUserAdminApi,
  updateUserRoleAdminApi,
  getReportsAdminApi,
  resolveReportAdminApi,
  deleteReportApi,
  getModerationFlagsApi,
  resolveModerationFlagApi,
  getAuditLogsAdminApi,
  getAdminSettingsApi,
  updateAdminSettingApi,
  permanentDeleteUserAdminApi,
  cancelUserDeletionAdminApi,
} from '../api/axiosClient';
import {
  getAllExpertApplicationsAdminApi,
  approveExpertApplicationAdminApi,
  rejectExpertApplicationAdminApi,
} from '../api/expertApi';
import { getQueryData, setQueryData } from '../utils/queryCache';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import IconSidebar from '../components/IconSidebar';
import Loader from '../components/Loader';

export default function AdminPage() {
  const { user, accessToken } = useAuth();
  const { showError, showConfirm, showAlert } = useAlert();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab');
  const validTabs = ['users', 'experts', 'moderation', 'audit', 'settings'];
  const activeTab = validTabs.includes(currentTab) ? currentTab : 'users';
  const setActiveTab = (tab) => {
    setSearchParams({ tab });
  };

  // State
  const [users, setUsers] = useState([]);
  const [expertApplications, setExpertApplications] = useState([]);
  const [expertFilter, setExpertFilter] = useState('ALL');
  const [reports, setReports] = useState([]);
  const [flags, setFlags] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [settings, setSettings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });

  // New Setting state
  const [newSettingKey, setNewSettingKey] = useState('');
  const [newSettingVal, setNewSettingVal] = useState('');
  const [newSettingDesc, setNewSettingDesc] = useState('');

  useEffect(() => {
    loadData();
  }, [activeTab, accessToken]);

  const loadData = async (silent = false) => {
    const cacheKey = `admin:${activeTab}`;
    const cached = getQueryData(cacheKey);

    if (cached) {
      if (activeTab === 'users') setUsers(cached);
      else if (activeTab === 'experts') setExpertApplications(cached);
      else if (activeTab === 'moderation') {
        setReports(cached.reports || []);
        setFlags(cached.flags || []);
      } else if (activeTab === 'audit') setAuditLogs(cached);
      else if (activeTab === 'settings') setSettings(cached);

      setLoading(false);
    } else if (!silent) {
      setLoading(true);
    }

    try {
      if (activeTab === 'users') {
        const data = await getAllUsersAdminApi(accessToken);
        setUsers(data);
        setQueryData(cacheKey, data);
      } else if (activeTab === 'experts') {
        const apps = await getAllExpertApplicationsAdminApi(accessToken);
        setExpertApplications(apps);
        setQueryData(cacheKey, apps);
      } else if (activeTab === 'moderation') {
        const [repData, flagData] = await Promise.allSettled([
          getReportsAdminApi(accessToken),
          getModerationFlagsApi(accessToken),
        ]);
        const rList = repData.status === 'fulfilled' ? repData.value : [];
        const fList = flagData.status === 'fulfilled' ? flagData.value : [];
        setReports(rList);
        setFlags(fList);
        setQueryData(cacheKey, { reports: rList, flags: fList });
      } else if (activeTab === 'audit') {
        const logs = await getAuditLogsAdminApi(accessToken);
        setAuditLogs(logs);
        setQueryData(cacheKey, logs);
      } else if (activeTab === 'settings') {
        const st = await getAdminSettingsApi(accessToken);
        setSettings(st);
        setQueryData(cacheKey, st);
      }
    } catch (err) {
      if (!cached) {
        setStatusMessage({ text: 'Failed to load administrative data.', type: 'error' });
      }
    } finally {
      setLoading(false);
    }
  };

  // User Actions (Optimistic & Silent Refresh)
  const handleToggleUserBan = async (targetUser) => {
    const isCurrentlyActive = targetUser.isActive !== false;
    setActionLoading(`ban-${targetUser.id}`);
    
    // Optimistic local state update
    setUsers((prev) =>
      prev.map((u) => (u.id === targetUser.id ? { ...u, isActive: !isCurrentlyActive } : u))
    );

    try {
      if (isCurrentlyActive) {
        await banUserAdminApi(targetUser.id, accessToken);
        setStatusMessage({ text: `User ${targetUser.name || targetUser.email} has been deactivated.`, type: 'success' });
      } else {
        await unbanUserAdminApi(targetUser.id, accessToken);
        setStatusMessage({ text: `User ${targetUser.name || targetUser.email} has been reactivated.`, type: 'success' });
      }
      loadData(true);
    } catch (err) {
      // Revert on error
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, isActive: isCurrentlyActive } : u))
      );
      showError(err, 'Failed to update user status.');
      setStatusMessage({ text: 'Action failed.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(`role-${userId}`);
    const originalUsers = [...users];

    // Optimistic update
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );

    try {
      await updateUserRoleAdminApi(userId, newRole, accessToken);
      setStatusMessage({ text: `User role successfully updated to ${newRole}.`, type: 'success' });
      loadData(true);
    } catch (err) {
      setUsers(originalUsers);
      showError(err, 'Failed to update user role.');
      setStatusMessage({ text: 'Failed to update user role.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelDeletionAdmin = async (userId) => {
    setActionLoading(`cancel-del-${userId}`);
    try {
      await cancelUserDeletionAdminApi(userId, accessToken);
      setStatusMessage({ text: 'Scheduled deletion successfully cancelled. User restored to Active.', type: 'success' });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, accountStatus: 'ACTIVE' } : u))
      );
      loadData(true);
    } catch (err) {
      showError(err, 'Failed to cancel deletion request.');
      setStatusMessage({ text: 'Action failed.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePermanentDeleteUser = async (targetUser) => {
    const confirmed = await showConfirm({
      title: 'Direct Permanent Deletion',
      message: `Are you sure you want to permanently delete user "${targetUser.name || targetUser.fullName || targetUser.email}"? All private data and tokens will be erased, and collaborative contributions will be anonymized. This action cannot be undone.`,
      confirmText: 'Permanently Delete',
      cancelText: 'Cancel',
      isDangerous: true,
    });

    if (!confirmed) return;

    setActionLoading(`perm-del-${targetUser.id}`);
    try {
      await permanentDeleteUserAdminApi(targetUser.id, accessToken);
      setStatusMessage({ text: `User ${targetUser.name || targetUser.email} has been permanently deleted and anonymized.`, type: 'success' });
      setUsers((prev) => prev.filter((u) => u.id !== targetUser.id));
      loadData(true);
    } catch (err) {
      showError(err, 'Failed to permanently delete user.');
      setStatusMessage({ text: 'Permanent deletion failed.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // Expert Application Actions
  const handleApproveExpert = async (application) => {
    setActionLoading(`expert-approve-${application.id}`);
    try {
      await approveExpertApplicationAdminApi(application.id, accessToken);
      // Also update role in backend if not already set
      if (application.userId) {
        try {
          await updateUserRoleAdminApi(application.userId, 'EXPERT', accessToken);
        } catch (_) {}
      }

      setExpertApplications((prev) =>
        prev.map((app) =>
          app.id === application.id ? { ...app, status: 'APPROVED', reviewedAt: new Date().toISOString() } : app
        )
      );

      setUsers((prev) =>
        prev.map((u) =>
          u.id === application.userId ? { ...u, role: 'EXPERT' } : u
        )
      );

      setStatusMessage({
        text: `Application for ${application.applicantName} approved! User has been granted the EXPERT role.`,
        type: 'success',
      });
      loadData(true);
    } catch (err) {
      showError(err, 'Failed to approve expert application.');
      setStatusMessage({ text: 'Failed to approve application.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectExpert = async (application) => {
    const confirmed = await showConfirm({
      title: 'Reject Expert Application',
      message: `Are you sure you want to reject the application submitted by ${application.applicantName}?`,
      confirmText: 'Reject Application',
      isDangerous: true,
    });
    if (!confirmed) return;

    setActionLoading(`expert-reject-${application.id}`);
    try {
      await rejectExpertApplicationAdminApi(
        application.id,
        'Application does not meet current verification requirements.',
        accessToken
      );

      setExpertApplications((prev) =>
        prev.map((app) =>
          app.id === application.id ? { ...app, status: 'REJECTED', reviewedAt: new Date().toISOString() } : app
        )
      );

      setStatusMessage({
        text: `Application for ${application.applicantName} has been rejected.`,
        type: 'success',
      });
      loadData(true);
    } catch (err) {
      showError(err, 'Failed to reject expert application.');
      setStatusMessage({ text: 'Failed to reject application.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // Moderation Actions
  const handleResolveReport = async (reportId) => {
    setActionLoading(`report-${reportId}`);
    try {
      await resolveReportAdminApi(reportId, accessToken);
      setStatusMessage({ text: 'Report marked as resolved.', type: 'success' });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (err) {
      showError(err, 'Failed to resolve report.');
      setStatusMessage({ text: 'Failed to resolve report.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteReport = async (reportId) => {
    const confirmed = await showConfirm({
      title: 'Delete Content Report',
      message: 'Are you sure you want to permanently delete this report? This will remove it from the moderation queue.',
      confirmText: 'Delete Report',
      isDangerous: true,
    });
    if (!confirmed) return;

    setActionLoading(`del-report-${reportId}`);
    try {
      await deleteReportApi(reportId, accessToken);
      setStatusMessage({ text: 'Report deleted successfully.', type: 'success' });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (err) {
      showError(err, 'Failed to delete report.');
      setStatusMessage({ text: 'Failed to delete report.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveFlag = async (flagId) => {
    setActionLoading(`flag-${flagId}`);
    try {
      await resolveModerationFlagApi(flagId, accessToken);
      setStatusMessage({ text: 'Moderation flag resolved.', type: 'success' });
      setFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch (err) {
      showError(err, 'Failed to resolve flag.');
      setStatusMessage({ text: 'Failed to resolve flag.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // Settings Actions
  const handleSaveSetting = async (e) => {
    e.preventDefault();
    if (!newSettingKey.trim()) return;
    setActionLoading('save-setting');
    try {
      await updateAdminSettingApi(newSettingKey.trim(), newSettingVal, newSettingDesc, accessToken);
      setStatusMessage({ text: `Setting '${newSettingKey}' saved successfully.`, type: 'success' });
      setNewSettingKey('');
      setNewSettingVal('');
      setNewSettingDesc('');
      const updated = await getAdminSettingsApi(accessToken);
      setSettings(updated);
    } catch (err) {
      showError(err, 'Failed to save setting.');
      setStatusMessage({ text: 'Failed to save setting.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.fullName && u.fullName.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q))
    );
  });

  return (
    <div className="page-shell min-h-screen flex flex-col sm:pr-[60px]">
      <Navbar />
      <IconSidebar />
      <div className="flex flex-1">
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
            
            {/* Header */}
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 font-bold text-sm">
                    🛡️
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Admin Control Center</span>
                </div>
                <h1 className="text-3xl font-black tracking-tight text-text-primary">Platform Administration</h1>
                <p className="mt-1 text-sm text-secondary">
                  Manage registered users, review flagged content reports, inspect audit trails, and configure platform settings.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/admin/statistics"
                  className="flex items-center gap-1.5 rounded-xl border border-border-default bg-surface px-3 py-2 text-xs font-bold text-text-secondary hover:text-text-primary hover:bg-surface-alt transition shadow-xs"
                >
                  <span>📊</span>
                  <span>Statistics</span>
                </Link>
                <Link
                  to="/admin/reports"
                  className="flex items-center gap-1.5 rounded-xl border border-border-default bg-surface px-3 py-2 text-xs font-bold text-text-secondary hover:text-text-primary hover:bg-surface-alt transition shadow-xs"
                >
                  <span>🚩</span>
                  <span>Reports Management</span>
                </Link>

                <div className="flex items-center gap-1 rounded-2xl bg-surface p-1 border border-border-default shadow-xs">
                  {[
                    { id: 'users', label: 'Users', icon: '👥' },
                    { id: 'experts', label: 'Expert Apps', icon: '🏅' },
                    { id: 'moderation', label: 'Quick Flags', icon: '⚡' },
                    { id: 'audit', label: 'Audit Logs', icon: '📋' },
                    { id: 'settings', label: 'Settings', icon: '⚙️' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                        activeTab === tab.id
                          ? 'bg-primary text-white shadow-xs'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-alt'
                      }`}
                    >
                      <span>{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Status Feedback Notification */}
            {statusMessage.text && (
              <div
                className={`mb-6 flex items-center justify-between rounded-2xl p-4 text-sm ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-500/10 border border-red-500/30 text-red-800 dark:text-red-300'
                }`}
              >
                <span>{statusMessage.text}</span>
                <button
                  onClick={() => setStatusMessage({ text: '', type: '' })}
                  className="text-xs font-bold opacity-70 hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Tab 1: User Management */}
            {activeTab === 'users' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <input
                      type="text"
                      placeholder="Search users by name, email, or role..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="app-input pl-10 pr-4 py-2.5 text-xs sm:text-sm"
                    />
                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-muted">
                    Total: {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {loading ? (
                  <Loader message="Loading user directory..." />
                ) : (
                  <div className="rounded-[2rem] border border-border-default bg-surface shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="border-b border-border-default bg-surface-alt text-muted text-[11px] uppercase tracking-wider font-semibold">
                          <tr>
                            <th className="py-3.5 px-4">User</th>
                            <th className="py-3.5 px-4">Role</th>
                            <th className="py-3.5 px-4">Status</th>
                            <th className="py-3.5 px-4">Joined</th>
                            <th className="py-3.5 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-default">
                          {filteredUsers.length === 0 ? (
                            <tr>
                              <td colSpan="5" className="py-8 text-center text-muted">
                                No users matched your search criteria.
                              </td>
                            </tr>
                          ) : (
                            filteredUsers.map((u) => {
                              const isActive = u.isActive !== false;
                              const isSelf = user && (user.id === u.id || user.email === u.email);
                              return (
                                <tr key={u.id} className="hover:bg-surface-alt/50 transition">
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                      {u.avatar ? (
                                        <img src={u.avatar} alt="" className="h-8 w-8 rounded-full bg-primary-soft" />
                                      ) : (
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                                          {(u.name || u.fullName || u.email || 'U').charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <p className="font-bold text-text-primary truncate">{u.name || u.fullName || 'User'}</p>
                                        <p className="text-xs text-muted truncate">{u.email}</p>
                                      </div>
                                    </div>
                                  </td>

                                  <td className="py-3.5 px-4">
                                    <select
                                      value={u.role || 'USER'}
                                      disabled={isSelf || actionLoading === `role-${u.id}`}
                                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                      className="rounded-xl border border-border-default bg-surface px-2.5 py-1 text-xs font-bold text-text-primary focus:border-primary disabled:opacity-50"
                                    >
                                      <option value="USER">USER</option>
                                      <option value="EXPERT">EXPERT</option>
                                      <option value="MODERATOR">MODERATOR</option>
                                      <option value="ADMIN">ADMIN</option>
                                    </select>
                                  </td>

                                  <td className="py-3.5 px-4">
                                     {u.accountStatus === 'PENDING_DELETION' ? (
                                       <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30" title={`Scheduled: ${u.scheduledDeletionAt ? new Date(u.scheduledDeletionAt).toLocaleString() : '14-day hold'}`}>
                                         <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                                         Deletion Hold (14d)
                                       </span>
                                     ) : u.accountStatus === 'DEACTIVATED' ? (
                                       <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30" title={`Until: ${u.deactivateUntil ? new Date(u.deactivateUntil).toLocaleDateString() : 'Manual'}`}>
                                         <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                         Deactivated
                                       </span>
                                     ) : u.accountStatus === 'DELETED' ? (
                                       <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/30">
                                         <span className="h-1.5 w-1.5 rounded-full bg-gray-500" />
                                         Deleted
                                       </span>
                                     ) : (
                                       <span
                                         className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                           isActive
                                             ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                             : 'bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/30'
                                         }`}
                                       >
                                         <span
                                           className={`h-1.5 w-1.5 rounded-full ${
                                             isActive ? 'bg-emerald-500' : 'bg-red-500'
                                           }`}
                                         />
                                         {isActive ? 'Active' : 'Deactivated'}
                                       </span>
                                     )}
                                   </td>

                                   <td className="py-3.5 px-4 text-xs text-muted">
                                     {u.createdAt
                                       ? new Date(u.createdAt).toLocaleDateString('en-US', {
                                           year: 'numeric',
                                           month: 'short',
                                           day: 'numeric',
                                         })
                                       : '—'}
                                   </td>

                                   <td className="py-3.5 px-4 text-right">
                                     {!isSelf ? (
                                       <div className="flex items-center justify-end gap-1.5">
                                         {u.accountStatus === 'PENDING_DELETION' && (
                                           <button
                                             onClick={() => handleCancelDeletionAdmin(u.id)}
                                             disabled={actionLoading === `cancel-del-${u.id}`}
                                             className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-800 transition disabled:opacity-50"
                                             title="Cancel 14-day scheduled deletion and restore user"
                                           >
                                             {actionLoading === `cancel-del-${u.id}` ? '...' : '↺ Cancel Deletion'}
                                           </button>
                                         )}

                                         {u.accountStatus !== 'DELETED' && (
                                           <button
                                             onClick={() => handleToggleUserBan(u)}
                                             disabled={actionLoading === `ban-${u.id}`}
                                             className={`rounded-xl px-2.5 py-1 text-xs font-bold transition disabled:opacity-50 ${
                                               isActive
                                                 ? 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-800'
                                                 : 'border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-800'
                                             }`}
                                           >
                                             {actionLoading === `ban-${u.id}`
                                               ? '...'
                                               : isActive
                                               ? 'Deactivate'
                                               : 'Reactivate'}
                                           </button>
                                         )}

                                         {u.accountStatus !== 'DELETED' && (
                                           <button
                                             onClick={() => handlePermanentDeleteUser(u)}
                                             disabled={actionLoading === `perm-del-${u.id}`}
                                             className="rounded-xl border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:border-red-800 transition disabled:opacity-50"
                                             title="Permanently delete user and anonymize contributions"
                                           >
                                             {actionLoading === `perm-del-${u.id}` ? '...' : 'Delete'}
                                           </button>
                                         )}
                                       </div>
                                     ) : (
                                       <span className="text-[11px] font-semibold text-muted">Current User</span>
                                     )}
                                   </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Expert Verification Applications */}
            {activeTab === 'experts' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black text-text-primary flex items-center gap-2">
                      <span>🏅</span>
                      <span>Expert Role Applications</span>
                    </h2>
                    <p className="text-xs text-secondary mt-0.5">
                      Review credentials, certifications, domain experience, and approve qualified platform contributors as Experts.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 rounded-xl border border-border-default bg-surface p-1 shadow-xs">
                    {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setExpertFilter(filter)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                          expertFilter === filter
                            ? 'bg-primary text-white shadow-xs'
                            : 'text-text-secondary hover:text-text-primary hover:bg-surface-alt'
                        }`}
                      >
                        {filter.charAt(0) + filter.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {loading ? (
                  <Loader message="Loading expert verification applications..." />
                ) : (
                  <div className="space-y-4">
                    {expertApplications.filter((app) => {
                      if (expertFilter === 'PENDING') return app.status === 'PENDING';
                      if (expertFilter === 'APPROVED') return app.status === 'APPROVED';
                      if (expertFilter === 'REJECTED') return app.status === 'REJECTED';
                      return true;
                    }).length === 0 ? (
                      <div className="rounded-[2rem] border border-border-default bg-surface p-12 text-center shadow-sm">
                        <span className="text-4xl">🏅</span>
                        <h3 className="mt-3 text-base font-black text-text-primary">No Applications Found</h3>
                        <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
                          {expertFilter === 'PENDING'
                            ? 'There are currently no pending expert applications requiring review.'
                            : 'No expert applications match the selected status filter.'}
                        </p>
                      </div>
                    ) : (
                      expertApplications
                        .filter((app) => {
                          if (expertFilter === 'PENDING') return app.status === 'PENDING';
                          if (expertFilter === 'APPROVED') return app.status === 'APPROVED';
                          if (expertFilter === 'REJECTED') return app.status === 'REJECTED';
                          return true;
                        })
                        .map((app) => {
                          const isPending = app.status === 'PENDING';
                          const isApproved = app.status === 'APPROVED';
                          const isRejected = app.status === 'REJECTED';
                          const isLoadingApprove = actionLoading === `expert-approve-${app.id}`;
                          const isLoadingReject = actionLoading === `expert-reject-${app.id}`;

                          return (
                            <div
                              key={app.id}
                              className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm transition hover:border-primary/40 space-y-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-default/60 pb-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 font-bold text-base border border-amber-500/20">
                                    {(app.applicantName || 'E').charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-black text-text-primary text-sm sm:text-base">
                                        {app.applicantName || 'Anonymous Applicant'}
                                      </h4>
                                      <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                                        {app.specialization || 'General Expert'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted mt-0.5">{app.applicantEmail}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
                                      isApproved
                                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                        : isRejected
                                        ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
                                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                    }`}
                                  >
                                    <span
                                      className={`h-2 w-2 rounded-full ${
                                        isApproved ? 'bg-emerald-500' : isRejected ? 'bg-rose-500' : 'bg-amber-500 animate-pulse'
                                      }`}
                                    />
                                    {app.status || 'PENDING'}
                                  </span>
                                  <span className="text-[11px] text-muted">
                                    {app.submittedAt
                                      ? new Date(app.submittedAt).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric',
                                        })
                                      : 'Recently'}
                                  </span>
                                </div>
                              </div>

                              {/* Details Grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div className="rounded-xl bg-surface-alt p-3 border border-border-default/60">
                                  <span className="font-bold text-muted uppercase text-[10px] tracking-wider block mb-1">
                                    Experience & Track Record
                                  </span>
                                  <p className="font-bold text-text-primary text-sm">
                                    {app.yearsExperience ? `${app.yearsExperience} Years Experience` : 'Not specified'}
                                  </p>
                                </div>

                                <div className="rounded-xl bg-surface-alt p-3 border border-border-default/60">
                                  <span className="font-bold text-muted uppercase text-[10px] tracking-wider block mb-1">
                                    Portfolio / Verification Link
                                  </span>
                                  {app.portfolioUrl ? (
                                    <a
                                      href={app.portfolioUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-bold text-primary hover:underline truncate block"
                                    >
                                      🔗 {app.portfolioUrl}
                                    </a>
                                  ) : (
                                    <span className="text-muted">No external portfolio link provided</span>
                                  )}
                                </div>
                              </div>

                              {/* Statement */}
                              <div className="rounded-xl bg-surface-alt/70 p-3.5 border border-border-default/60 text-xs">
                                <span className="font-bold text-muted uppercase text-[10px] tracking-wider block mb-1.5">
                                  Qualification Statement & Domain Authority
                                </span>
                                <p className="text-text-primary font-medium whitespace-pre-wrap leading-relaxed">
                                  {app.statement || 'No statement provided.'}
                                </p>
                              </div>

                              {/* Document / Resume Attachment Preview */}
                              {(app.documentUrl || app.documentName) && (
                                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white font-bold text-sm shrink-0">
                                      📄
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-bold text-xs text-text-primary truncate">
                                        {app.documentName || 'Verification_Credential.pdf'}
                                      </p>
                                      <p className="text-[11px] text-muted">
                                        Uploaded Certification / Resume Proof
                                      </p>
                                    </div>
                                  </div>

                                  {app.documentUrl && (
                                    <a
                                      href={app.documentUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      download={app.documentName || 'credential'}
                                      className="rounded-lg bg-surface border border-border-default px-3 py-1.5 text-xs font-bold text-primary hover:bg-surface-alt shrink-0 transition flex items-center gap-1 shadow-xs"
                                    >
                                      <span>📥</span>
                                      <span>Inspect / Download</span>
                                    </a>
                                  )}
                                </div>
                              )}

                              {/* Actions */}
                              {isPending && (
                                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-default/60">
                                  <button
                                    onClick={() => handleRejectExpert(app)}
                                    disabled={isLoadingReject || isLoadingApprove}
                                    className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-800 transition disabled:opacity-50"
                                  >
                                    {isLoadingReject ? 'Rejecting...' : '✕ Reject Application'}
                                  </button>
                                  <button
                                    onClick={() => handleApproveExpert(app)}
                                    disabled={isLoadingApprove || isLoadingReject}
                                    className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50 shadow-xs flex items-center gap-1.5"
                                  >
                                    <span>✓</span>
                                    <span>{isLoadingApprove ? 'Approving...' : 'Approve as Verified Expert'}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Moderation & Reports */}
            {activeTab === 'moderation' && (
              <div className="space-y-6">
                {loading ? (
                  <Loader message="Loading content reports & flags..." />
                ) : (
                  <div className="grid gap-6">
                    {/* Content Reports */}
                    <div className="rounded-[2rem] border border-border-default bg-surface p-6 shadow-sm space-y-4">
                      <div className="flex items-center justify-between border-b border-border-default pb-3">
                        <h2 className="text-lg font-black text-text-primary">Content Reports ({reports.length})</h2>
                        <span className="text-xs font-semibold text-muted">User submissions</span>
                      </div>

                      {reports.length === 0 ? (
                        <p className="text-sm text-muted py-4 text-center">No pending content reports 🎉</p>
                      ) : (
                        <div className="space-y-3">
                          {reports.map((report) => (
                            <div
                              key={report.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-default bg-surface-alt p-4"
                            >
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase">
                                    {report.contentType || 'CONTENT'} #{report.contentId || '—'}
                                  </span>
                                  <span className="text-xs text-muted">
                                    Reported by: {report.reporter?.email || report.reporter?.fullName || 'Anonymous'}
                                  </span>
                                </div>
                                <p className="text-sm font-semibold text-text-primary">{report.reason}</p>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleResolveReport(report.id)}
                                  disabled={actionLoading === `report-${report.id}`}
                                  className="rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-60 shadow-xs"
                                >
                                  {actionLoading === `report-${report.id}` ? 'Resolving...' : '✓ Mark Resolved'}
                                </button>
                                <button
                                  onClick={() => handleDeleteReport(report.id)}
                                  disabled={actionLoading === `del-report-${report.id}`}
                                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:border-red-800 disabled:opacity-60 transition shadow-xs"
                                  title="Delete report"
                                >
                                  {actionLoading === `del-report-${report.id}` ? '...' : '🗑️ Delete'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Moderation Flags */}
                    <div className="rounded-[2rem] border border-border-default bg-surface p-6 shadow-sm space-y-4">
                      <div className="flex items-center justify-between border-b border-border-default pb-3">
                        <h2 className="text-lg font-black text-text-primary">Moderation Flags ({flags.length})</h2>
                        <span className="text-xs font-semibold text-muted">Automated / Moderator alerts</span>
                      </div>

                      {flags.length === 0 ? (
                        <p className="text-sm text-muted py-4 text-center">No active moderation flags 🎉</p>
                      ) : (
                        <div className="space-y-3">
                          {flags.map((flag) => (
                            <div
                              key={flag.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-default bg-surface-alt p-4"
                            >
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase">
                                    {flag.targetType || 'FLAG'} #{flag.targetId || '—'}
                                  </span>
                                  <span className="text-xs text-muted">Status: {flag.status}</span>
                                </div>
                                <p className="text-sm font-semibold text-text-primary">{flag.reason}</p>
                              </div>

                              <button
                                onClick={() => handleResolveFlag(flag.id)}
                                disabled={actionLoading === `flag-${flag.id}`}
                                className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60 shadow-xs"
                              >
                                {actionLoading === `flag-${flag.id}` ? 'Resolving...' : '✓ Resolve Flag'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Audit Logs */}
            {activeTab === 'audit' && (
              <div className="space-y-6">
                {loading ? (
                  <Loader message="Fetching platform audit trail..." />
                ) : (
                  <div className="rounded-[2rem] border border-border-default bg-surface shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-border-default bg-surface-alt text-muted text-[11px] uppercase tracking-wider font-semibold">
                          <tr>
                            <th className="py-3.5 px-4">Timestamp</th>
                            <th className="py-3.5 px-4">Actor</th>
                            <th className="py-3.5 px-4">Action</th>
                            <th className="py-3.5 px-4">Target Entity</th>
                            <th className="py-3.5 px-4">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-default">
                          {auditLogs.length === 0 ? (
                            <tr>
                              <td colSpan="5" className="py-8 text-center text-muted">
                                No audit events logged yet.
                              </td>
                            </tr>
                          ) : (
                            auditLogs.map((log, idx) => (
                              <tr key={log.id || idx} className="hover:bg-surface-alt/50 transition">
                                <td className="py-3 px-4 text-muted whitespace-nowrap">
                                  {log.createdAt
                                    ? new Date(log.createdAt).toLocaleString()
                                    : 'Recently'}
                                </td>
                                <td className="py-3 px-4 font-bold text-text-primary">
                                  {log.userEmail || log.actor || 'System'}
                                </td>
                                <td className="py-3 px-4">
                                  <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
                                    {log.action}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-text-secondary">
                                  {log.entityType ? `${log.entityType} #${log.entityId || ''}` : '—'}
                                </td>
                                <td className="py-3 px-4 text-muted max-w-xs truncate">
                                  {log.details || log.description || '—'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: System Settings */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                {loading ? (
                  <Loader message="Loading system settings..." />
                ) : (
                  <>
                    {/* Add / Update Setting Form */}
                    <div className="rounded-[2rem] border border-border-default bg-surface p-6 shadow-sm">
                      <h2 className="text-lg font-black text-text-primary mb-1">Set Configuration Variable</h2>
                      <p className="text-xs text-muted mb-4">Define platform-wide environment switches or system parameters.</p>
                      
                      <form onSubmit={handleSaveSetting} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <input
                          type="text"
                          required
                          placeholder="Key (e.g. PLATFORM_MAINTENANCE)"
                          value={newSettingKey}
                          onChange={(e) => setNewSettingKey(e.target.value)}
                          className="app-input px-3 py-2 text-xs"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Value (e.g. true / 50)"
                          value={newSettingVal}
                          onChange={(e) => setNewSettingVal(e.target.value)}
                          className="app-input px-3 py-2 text-xs"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Description (optional)"
                            value={newSettingDesc}
                            onChange={(e) => setNewSettingDesc(e.target.value)}
                            className="app-input px-3 py-2 text-xs flex-1"
                          />
                          <button
                            type="submit"
                            disabled={actionLoading === 'save-setting'}
                            className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover shrink-0 disabled:opacity-60"
                          >
                            Save
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Current Settings Table */}
                    <div className="rounded-[2rem] border border-border-default bg-surface shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-border-default bg-surface-alt text-muted text-[11px] uppercase tracking-wider font-semibold">
                            <tr>
                              <th className="py-3.5 px-4">Key</th>
                              <th className="py-3.5 px-4">Value</th>
                              <th className="py-3.5 px-4">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-default">
                            {settings.length === 0 ? (
                              <tr>
                                <td colSpan="3" className="py-8 text-center text-muted">
                                  No custom system settings defined yet.
                                </td>
                              </tr>
                            ) : (
                              settings.map((s, idx) => (
                                <tr key={s.id || idx} className="hover:bg-surface-alt/50 transition">
                                  <td className="py-3.5 px-4 font-mono font-bold text-text-primary">
                                    {s.settingKey}
                                  </td>
                                  <td className="py-3.5 px-4 font-semibold text-primary">
                                    {s.settingValue}
                                  </td>
                                  <td className="py-3.5 px-4 text-muted">
                                    {s.description || '—'}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
}
