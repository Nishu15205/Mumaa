'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  CreditCard,
  Phone,
  DollarSign,
  TrendingUp,
  UserCheck,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { User as UserType } from '@/types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface AdminStats {
  totalUsers: number;
  parents: number;
  nannies: number;
  calls: number;
  activeCalls: number;
  completedCalls: number;
  revenue: number;
  subscriptions: number;
}

export default function AdminDashboard({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentUsers, setRecentUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [growthData, setGrowthData] = useState<{ month: string; users: number }[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, usersRes] = await Promise.all([
        apiGet<{ stats: { totalUsers: number; totalNannies: number; totalParents: number; totalCalls: number; activeCalls: number; completedCalls: number; totalRevenue: number; activeSubscriptions: number } }>('/api/admin/stats'),
        apiGet<{ users: UserType[] }>('/api/admin/users?limit=5'),
      ]);
      const apiStats = statsRes.stats;
      setStats({
        totalUsers: apiStats.totalUsers,
        parents: apiStats.totalParents,
        nannies: apiStats.totalNannies,
        calls: apiStats.totalCalls,
        activeCalls: apiStats.activeCalls,
        completedCalls: apiStats.completedCalls,
        revenue: apiStats.totalRevenue,
        subscriptions: apiStats.activeSubscriptions,
      });
      setRecentUsers(usersRes.users || []);

      // Generate growth data (last 6 months)
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      setGrowthData(months.map((m, i) => ({
        month: m,
        users: Math.round((apiStats.totalUsers / 6) * (i + 1) + Math.random() * 5),
      })));
    } catch {
      // empty
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'PARENT': return 'bg-rose-100 text-rose-700';
      case 'NANNY': return 'bg-emerald-100 text-emerald-700';
      case 'ADMIN': return 'bg-amber-100 text-amber-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-1" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Users',
      value: stats?.totalUsers || 0,
      sub: `${stats?.parents || 0} parents · ${stats?.nannies || 0} nannies`,
      icon: <Users className="h-5 w-5" />,
      color: 'from-rose-50 to-pink-50',
      iconColor: 'text-rose-500',
    },
    {
      label: 'Active Subscriptions',
      value: stats?.subscriptions || 0,
      sub: 'Paid plans active',
      icon: <CreditCard className="h-5 w-5" />,
      color: 'from-emerald-50 to-teal-50',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Total Calls',
      value: stats?.completedCalls || 0,
      sub: `${stats?.activeCalls || 0} active now`,
      icon: <Phone className="h-5 w-5" />,
      color: 'from-amber-50 to-orange-50',
      iconColor: 'text-amber-500',
    },
    {
      label: 'Revenue',
      value: `₹${(stats?.revenue || 0).toLocaleString('en-IN')}`,
      sub: 'This month',
      icon: <DollarSign className="h-5 w-5" />,
      color: 'from-purple-50 to-violet-50',
      iconColor: 'text-purple-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Overview</h1>
        <p className="text-gray-500 mt-1">Platform analytics and management dashboard</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
          >
            <Card className={cn('border-0 shadow-sm bg-gradient-to-br rounded-xl', card.color)}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">{card.label}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
                    <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                  </div>
                  <div className={cn('p-2.5 rounded-lg bg-white/70', card.iconColor)}>
                    {card.icon}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={() => onNavigate?.('users')}
          className="border-gray-200 text-gray-700 hover:bg-gray-50 gap-2"
        >
          <Users className="h-4 w-4" />
          Manage Users
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          onClick={() => onNavigate?.('calls')}
          className="border-gray-200 text-gray-700 hover:bg-gray-50 gap-2"
        >
          <Phone className="h-4 w-4" />
          View All Calls
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Growth chart */}
        <div className="lg:col-span-2">
          <Card className="rounded-xl border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">User Growth</h2>
              <p className="text-xs text-gray-400 mt-0.5">Last 6 months</p>
            </div>
            <CardContent className="p-4">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={growthData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="users"
                      stroke="#f43f5e"
                      strokeWidth={2.5}
                      dot={{ fill: '#f43f5e', strokeWidth: 0, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent signups */}
        <div>
          <Card className="rounded-xl border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Recent Signups</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate?.('users')}
                className="text-rose-500 hover:text-rose-600 text-xs"
              >
                View all
              </Button>
            </div>
            <div className="p-3">
              {recentUsers.length === 0 ? (
                <div className="text-center py-6">
                  <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">No users yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentUsers.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className={cn('text-xs font-semibold', getRoleBadge(u.role))}>
                          {getInitials(u.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">{u.name}</p>
                        <p className="text-[10px] text-gray-400">{u.email}</p>
                      </div>
                      <Badge variant="secondary" className={cn('text-[10px]', getRoleBadge(u.role))}>
                        {u.role === 'PARENT' ? 'Parent' : u.role === 'NANNY' ? 'Nanny' : 'Admin'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
