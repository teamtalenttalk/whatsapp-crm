"use client";

import { useEffect, useState, useCallback } from "react";
import { getDevices, getGroups, getGroupMembers, exportGroupMembers, addGroupToContacts } from "@/lib/api";

interface Device {
  id: string;
  name: string;
  status: string;
}

interface Group {
  id: string;
  name: string;
  size?: number;
  owner?: string;
  description?: string;
  creation?: string;
}

interface Member {
  name: string;
  number: string;
  jid: string;
  status?: string;
  role?: string;
  account_type?: string;
}

export default function GroupGrabberPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedGroupInfo, setSelectedGroupInfo] = useState<Group | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [error, setError] = useState("");

  const loadDevices = useCallback(async () => {
    try {
      const data = await getDevices();
      setDevices(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  async function handleDeviceChange(deviceId: string) {
    setSelectedDevice(deviceId);
    setSelectedGroup("");
    setSelectedGroupInfo(null);
    setMembers([]);
    setGroups([]);
    if (!deviceId) return;
    setLoadingGroups(true);
    try {
      const data = await getGroups(deviceId);
      setGroups(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load groups");
    } finally {
      setLoadingGroups(false);
    }
  }

  async function handleGroupChange(groupId: string) {
    setSelectedGroup(groupId);
    setMembers([]);
    if (!groupId || !selectedDevice) return;
    const group = groups.find((g) => g.id === groupId) || null;
    setSelectedGroupInfo(group);
    setLoadingMembers(true);
    try {
      const data = await getGroupMembers(selectedDevice, groupId);
      setMembers(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoadingMembers(false);
    }
  }

  async function refreshGroups() {
    if (!selectedDevice) return;
    setLoadingGroups(true);
    try {
      const data = await getGroups(selectedDevice);
      setGroups(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to refresh groups");
    } finally {
      setLoadingGroups(false);
    }
  }

  async function handleExportAll() {
    if (members.length === 0) return;
    try {
      await exportGroupMembers({ deviceId: selectedDevice, groupId: selectedGroup, members, type: "all" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function handleExportGroup() {
    if (members.length === 0) return;
    try {
      await exportGroupMembers({ deviceId: selectedDevice, groupId: selectedGroup, members, type: "group" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function handleAddToContacts() {
    if (members.length === 0) return;
    try {
      await addGroupToContacts({ deviceId: selectedDevice, groupId: selectedGroup, members });
      setError("");
      alert("Members added to contact list successfully.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add to contacts");
    }
  }

  const filteredMembers = members.filter((m) => {
    if (search && !m.name?.toLowerCase().includes(search.toLowerCase()) && !m.number?.includes(search)) return false;
    if (roleFilter && m.role !== roleFilter) return false;
    if (accountFilter && m.account_type !== accountFilter) return false;
    return true;
  });

  const uniqueRoles = Array.from(new Set(members.map((m) => m.role).filter(Boolean))) as string[];
  const uniqueAccountTypes = Array.from(new Set(members.map((m) => m.account_type).filter(Boolean))) as string[];

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold text-white">Group Grabber</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExportAll} disabled={members.length === 0} className="px-4 py-2 rounded-lg text-sm border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Export All Groups
          </button>
          <button onClick={handleAddToContacts} disabled={members.length === 0} className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Add to sender list
          </button>
          <button onClick={handleAddToContacts} disabled={members.length === 0} className="px-4 py-2 rounded-lg text-sm border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Create Contact List
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-300 hover:text-white">&times;</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Device & Group Selectors */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="card">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Instance</label>
                    <select value={selectedDevice} onChange={(e) => handleDeviceChange(e.target.value)} className="input-dark">
                      <option value="">-- Select Device --</option>
                      {devices.filter((d) => d.status === "connected").map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Group</label>
                    <div className="flex gap-2">
                      <select value={selectedGroup} onChange={(e) => handleGroupChange(e.target.value)} className="input-dark flex-1" disabled={!selectedDevice || loadingGroups}>
                        <option value="">{loadingGroups ? "Loading..." : "-- Select Group --"}</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name} {g.size ? `(${g.size})` : ""}</option>
                        ))}
                      </select>
                      <button onClick={refreshGroups} disabled={!selectedDevice || loadingGroups} className="px-3 py-2 rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors disabled:opacity-50" title="Refresh groups">
                        <svg className={`w-4 h-4 ${loadingGroups ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Group Details Preview */}
            <div className="card">
              <h3 className="text-sm font-medium text-slate-400 mb-2">Group Details</h3>
              {selectedGroupInfo ? (
                <div className="space-y-2 text-sm">
                  <p className="text-white font-semibold">{selectedGroupInfo.name}</p>
                  {selectedGroupInfo.size != null && <p className="text-slate-400">Members: <span className="text-slate-200">{selectedGroupInfo.size}</span></p>}
                  {selectedGroupInfo.owner && <p className="text-slate-400">Owner: <span className="text-slate-200">{selectedGroupInfo.owner}</span></p>}
                  {selectedGroupInfo.description && <p className="text-slate-400">Description: <span className="text-slate-200 line-clamp-3">{selectedGroupInfo.description}</span></p>}
                  {selectedGroupInfo.creation && <p className="text-slate-400">Created: <span className="text-slate-200">{new Date(selectedGroupInfo.creation).toLocaleDateString()}</span></p>}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Select a group to see details</p>
              )}
            </div>
          </div>

          {/* Search & Filters */}
          <div className="card mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Search name or number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-dark flex-1 min-w-[200px]"
              />
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input-dark w-auto">
                <option value="">Filter by role</option>
                {uniqueRoles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="input-dark w-auto">
                <option value="">Filter by account type</option>
                {uniqueAccountTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={handleExportGroup} disabled={filteredMembers.length === 0} className="px-4 py-2 rounded-lg text-sm bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Export Group
              </button>
            </div>
          </div>

          {/* Members Table */}
          {loadingMembers ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
            </div>
          ) : members.length === 0 && selectedGroup ? (
            <div className="card text-center text-slate-500 py-12">No members found in this group.</div>
          ) : members.length === 0 ? (
            <div className="card text-center text-slate-500 py-12">
              <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Select a device and group to view members.
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <div className="text-xs text-slate-500 mb-2">Showing {filteredMembers.length} of {members.length} members</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-3 text-slate-400 font-medium w-12">SN</th>
                    <th className="text-left py-3 px-3 text-slate-400 font-medium">Name</th>
                    <th className="text-left py-3 px-3 text-slate-400 font-medium">Number</th>
                    <th className="text-left py-3 px-3 text-slate-400 font-medium">JID</th>
                    <th className="text-left py-3 px-3 text-slate-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((m, i) => (
                    <tr key={m.jid || i} className="border-b border-slate-700/50 hover:bg-slate-800/80">
                      <td className="py-3 px-3 text-slate-500">{i + 1}</td>
                      <td className="py-3 px-3 text-white">{m.name || "-"}</td>
                      <td className="py-3 px-3 text-slate-300">{m.number || "-"}</td>
                      <td className="py-3 px-3 text-slate-400 text-xs font-mono">{m.jid || "-"}</td>
                      <td className="py-3 px-3 text-slate-400">{m.status || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
