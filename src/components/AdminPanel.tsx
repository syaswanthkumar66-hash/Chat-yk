import { useState, useEffect, useMemo } from 'react';
import { Icon, Avatar, Card, Button, cn } from './UI';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store';
import { BACKEND_URL } from '../config';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

const MOCK_STATS_TODAY = [
  { name: '00:00', users: 120, cpu: 5, ram: 40, space: 32, bandwidth: 45 },
  { name: '02:00', users: 80, cpu: 4, ram: 38, space: 32, bandwidth: 30 },
  { name: '04:00', users: 150, cpu: 10, ram: 42, space: 32, bandwidth: 60 },
  { name: '06:00', users: 400, cpu: 25, ram: 55, space: 32, bandwidth: 180 },
  { name: '08:00', users: 850, cpu: 42, ram: 65, space: 32, bandwidth: 420 },
];

const MOCK_STATS_DAILY = [
  { name: '00:00', users: 400, cpu: 12, ram: 45, space: 32, bandwidth: 120 },
  { name: '04:00', users: 300, cpu: 8, ram: 42, space: 32, bandwidth: 90 },
  { name: '08:00', users: 900, cpu: 45, ram: 68, space: 34, bandwidth: 450 },
  { name: '12:00', users: 1500, cpu: 62, ram: 75, space: 38, bandwidth: 820 },
  { name: '16:00', users: 1200, cpu: 55, ram: 70, space: 42, bandwidth: 680 },
  { name: '20:00', users: 800, cpu: 30, ram: 55, space: 45, bandwidth: 340 },
];

const MOCK_STATS_WEEKLY = [
  { name: 'Mon', users: 1200, cpu: 32, ram: 55, space: 45, bandwidth: 620 },
  { name: 'Tue', users: 1400, cpu: 38, ram: 58, space: 45, bandwidth: 710 },
  { name: 'Wed', users: 1300, cpu: 35, ram: 56, space: 46, bandwidth: 680 },
  { name: 'Thu', users: 1600, cpu: 42, ram: 62, space: 46, bandwidth: 840 },
  { name: 'Fri', users: 1800, cpu: 50, ram: 68, space: 47, bandwidth: 950 },
  { name: 'Sat', users: 1100, cpu: 28, ram: 52, space: 47, bandwidth: 580 },
  { name: 'Sun', users: 900, cpu: 22, ram: 48, space: 47, bandwidth: 420 },
];

const MOCK_STATS_MONTHLY = [
  { name: 'Week 1', users: 8500, cpu: 35, ram: 58, space: 45, bandwidth: 4200 },
  { name: 'Week 2', users: 9200, cpu: 38, ram: 60, space: 46, bandwidth: 4800 },
  { name: 'Week 3', users: 8800, cpu: 36, ram: 59, space: 47, bandwidth: 4500 },
  { name: 'Week 4', users: 9500, cpu: 40, ram: 62, space: 48, bandwidth: 5100 },
];

const MOCK_STATS_YEARLY = [
  { name: 'Jan', users: 32000, cpu: 30, ram: 52, space: 40, bandwidth: 18000 },
  { name: 'Feb', users: 35000, cpu: 32, ram: 54, space: 42, bandwidth: 20000 },
  { name: 'Mar', users: 42000, cpu: 38, ram: 58, space: 45, bandwidth: 24000 },
  { name: 'Apr', users: 38000, cpu: 35, ram: 56, space: 46, bandwidth: 22000 },
  { name: 'May', users: 45000, cpu: 42, ram: 62, space: 48, bandwidth: 26000 },
  { name: 'Jun', users: 48000, cpu: 45, ram: 65, space: 50, bandwidth: 28000 },
];

const MOCK_STATS_ALL_TIME = [
  { name: '2022', users: 120000, cpu: 25, ram: 48, space: 30, bandwidth: 850000 },
  { name: '2023', users: 280000, cpu: 35, ram: 58, space: 45, bandwidth: 1950000 },
  { name: '2024', users: 450000, cpu: 42, ram: 65, space: 60, bandwidth: 3200000 },
  { name: '2025', users: 820000, cpu: 55, ram: 75, space: 85, bandwidth: 5800000 },
];

const TEAM_ROLES = [
  { id: 'backend', label: 'Backend', icon: 'terminal' },
  { id: 'frontend', label: 'Frontend', icon: 'code' },
  { id: 'design', label: 'Design', icon: 'palette' },
  { id: 'support', label: 'Support', icon: 'support_agent' },
  { id: 'marketing', label: 'Marketing', icon: 'campaign' },
  { id: 'website', label: 'Website', icon: 'language' },
  { id: 'management', label: 'Management', icon: 'admin_panel_settings' }
];

const ADMIN_TABS = [
  { id: 'monitor', label: 'Monitoring', icon: 'monitoring' },
  { id: 'helpdesk', label: 'Help Desk', icon: 'support_agent' },
  { id: 'user_manage', label: 'User Management', icon: 'manage_accounts' },
  { id: 'users', label: 'Team Members', icon: 'group' },
  { id: 'broadcast', label: 'Broadcast', icon: 'campaign' },
  { id: 'integrations', label: 'Integrations', icon: 'hub' },
  { id: 'security', label: 'Security', icon: 'security' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'website', label: 'Website', icon: 'language' }
];

const FLAG_OPTIONS = [
  'Spam / Advertising',
  'Harassment / Bullying',
  'Inappropriate Content',
  'Bot / Automated Activity',
  'Suspicious Behavior',
  'Other'
];

export const AdminPanel = ({ onClose }: { onClose: () => void }) => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'helpdesk' | 'user_manage' | 'users' | 'broadcast' | 'integrations' | 'security' | 'settings' | 'website'>('monitor');
  const [timeframe, setTimeframe] = useState<'today' | 'weekly' | 'monthly' | 'yearly' | 'all_time'>('today');
  const [systemHealth, setSystemHealth] = useState(98);
  const { 
    user,
    users, 
    banUser, 
    flagUser,
    promoteUser, 
    updateUserByAdmin,
    addUser,
    reportUser,
    systemSettings, 
    updateSystemSettings,
    tickets,
    updateTicketStatus,
    deleteTicket,
    feedback,
    deleteFeedback,
    broadcasts,
    sendBroadcast,
    deleteBroadcast,
    sendTicketMessage,
    setMode,
    setActiveRecipientId,
    sendMessage
  } = useAppStore();

  const [securitySearchQuery, setSecuritySearchQuery] = useState('');
  const [visibleSecurityLogsCount, setVisibleSecurityLogsCount] = useState(5);

  const realSystemLogs = useMemo(() => {
    const logs = [];

    // 1. Current user login log
    if (user) {
      logs.push({
        icon: 'login',
        text: `Admin logged in from web app`,
        time: 'Now',
        color: 'text-primary',
        bg: 'bg-primary/10'
      });
    }

    // 2. Team member registration logs
    users.slice(0, 3).forEach((u, idx) => {
      logs.push({
        icon: u.isAdmin ? 'verified_user' : 'person_add',
        text: `${u.isAdmin ? 'Admin' : 'User'} ${u.displayName} active on network`,
        time: u.lastSeen ? new Date(u.lastSeen).toLocaleTimeString() : `${idx * 15 + 5}m ago`,
        color: u.isOnline ? 'text-emerald-500' : 'text-slate-500',
        bg: u.isOnline ? 'bg-emerald-50' : 'bg-slate-50'
      });
    });

    // 3. System stats logs
    logs.push({
      icon: 'cloud_done',
      text: 'Sync completed with Firebase database',
      time: 'Live',
      color: 'text-blue-500',
      bg: 'bg-blue-50'
    });

    return logs;
  }, [users, user]);

  const realAccessLogs = useMemo(() => {
    const logs = [];
    
    // Add current user session
    if (user) {
      logs.push({
        event: 'Admin Session',
        user: user.username || user.displayName.toLowerCase().replace(/\s+/g, '_') || 'admin',
        ip: '127.0.0.1 (Local)',
        status: 'success' as const,
        time: 'Now',
        location: 'Authorized Browser'
      });
    }

    // Add all other users
    users.forEach((u) => {
      logs.push({
        event: u.isBanned ? 'Access Revoked' : (u.isAdmin ? 'Admin Session' : 'User Auth Session'),
        user: u.username || u.displayName.toLowerCase().replace(/\s+/g, '_'),
        ip: u.isOnline ? 'Active Connection' : 'Offline',
        status: u.isBanned ? ('failed' as const) : ('success' as const),
        time: u.lastSeen ? new Date(u.lastSeen).toLocaleDateString() : (u.joinDate || 'Recently'),
        location: u.isOnline ? 'Online Access' : 'Offline Session'
      });
    });

    return logs;
  }, [users, user]);

  const filteredAccessLogs = useMemo(() => {
    if (!securitySearchQuery) return realAccessLogs;
    const query = securitySearchQuery.toLowerCase();
    return realAccessLogs.filter(log => 
      log.event.toLowerCase().includes(query) ||
      log.user.toLowerCase().includes(query) ||
      log.location.toLowerCase().includes(query) ||
      log.ip.toLowerCase().includes(query)
    );
  }, [realAccessLogs, securitySearchQuery]);

  const isUserInactive = (lastSeen?: string) => {
    if (!lastSeen) return true;
    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastSeenDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 30;
  };

  const getOfflineDuration = (lastSeen?: string) => {
    if (!lastSeen) return 'Never';
    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastSeenDate.getTime());
    
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days === 0 && hours === 0) return 'Just now';
    if (days === 0) return `${hours}h offline`;
    return `${days}d ${hours}h offline`;
  };

  const getUserStatus = (u: any) => {
    if (u.isBanned) return { label: 'Removed Member', color: 'red' };
    if (u.isInApp) return { label: 'In App', color: 'emerald' };
    if (u.isOnline) return { label: 'Online', color: 'blue' };
    if (isUserInactive(u.lastSeen)) return { label: 'Inactive', color: 'slate' };
    return { label: 'Offline', color: 'slate' };
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'in_app' | 'inactive'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [teamCategoryFilter, setTeamCategoryFilter] = useState<string>('all');
  const [isUserFilterOpen, setIsUserFilterOpen] = useState(false);
  const [ticketSearchQuery, setTicketSearchQuery] = useState('');
  const [ticketFilter, setTicketFilter] = useState<'all' | 'open' | 'in-progress' | 'resolved'>('all');
  const [isTicketFilterOpen, setIsTicketFilterOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastType, setBroadcastType] = useState<'info' | 'warning' | 'error' | 'success' | 'update' | 'critical' | 'announcement' | 'maintenance' | 'security'>('info');
  const [broadcastAudience, setBroadcastAudience] = useState<'all' | 'admins' | 'members' | 'users'>('all');
  const [broadcastPersistence, setBroadcastPersistence] = useState<'temporary' | 'persistent'>('temporary');
  const [broadcastActionLink, setBroadcastActionLink] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [broadcastSchedule, setBroadcastSchedule] = useState(false);
  const [broadcastScheduleDate, setBroadcastScheduleDate] = useState('');
  const [broadcastSelectedUsers, setBroadcastSelectedUsers] = useState<string[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<{name: string, content: string} | null>(null);

  const [websiteData, setWebsiteData] = useState({
    maintenanceMode: false,
    heroTitle: 'Next-Gen Protocol Interface',
    heroSubtitle: 'Seamlessly manage your digital infrastructure with our advanced control panel.',
    contactEmail: 'admin@protocol.net',
    seoTitle: 'Protocol | Admin Dashboard',
    seoDescription: 'Secure and advanced protocol management system.'
  });

  const [broadcastTemplates, setBroadcastTemplates] = useState([
    { id: 't1', name: 'System Maintenance', content: 'SYSTEM MAINTENANCE SCHEDULED FOR [DATE] AT [TIME]. EXPECT BRIEF DOWNTIME.', type: 'maintenance' as const },
    { id: 't2', name: 'Security Alert', content: 'SECURITY PROTOCOL UPDATE: PLEASE RE-VERIFY YOUR ACCESS CREDENTIALS IMMEDIATELY.', type: 'security' as const },
    { id: 't3', name: 'New Feature', content: 'EXCITING NEWS! WE HAVE JUST DEPLOYED [FEATURE NAME]. CHECK IT OUT IN THE DASHBOARD.', type: 'announcement' as const },
  ]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'scheduled'>('all');
  const [editingUser, setEditingUser] = useState<any>(null);
  const [flaggingUser, setFlaggingUser] = useState<any>(null);
  const [flagReason, setFlagReason] = useState('');
  const [selectedFlagOption, setSelectedFlagOption] = useState(FLAG_OPTIONS[0]);
  const [showSuccessMessage, setShowSuccessMessage] = useState<string | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '', type: 'info' as any });
  const [isCreatingService, setIsCreatingService] = useState(false);
  const [newService, setNewService] = useState({ name: '', description: '', icon: 'hub' });
  const [isCreatingWebhook, setIsCreatingWebhook] = useState(false);
  const [newWebhook, setNewWebhook] = useState({ name: '', url: '', events: [] as string[] });
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [dismissedBroadcasts, setDismissedBroadcasts] = useState<string[]>([]);
  const [editForm, setEditForm] = useState({ 
    displayName: '', 
    description: '', 
    isAdmin: false,
    username: '',
    avatar: '',
    allowedTabs: [] as string[],
    teamRole: '',
    accessibleTeamMembers: [] as string[]
  });

  const BroadcastBanner = ({ audience }: { audience: 'all' | 'admins' | 'members' }) => {
    const latest = broadcasts.find(b => 
      (b.audience === audience || b.audience === 'all') && 
      !dismissedBroadcasts.includes(b.id)
    );

    if (!latest) return null;

    return (
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "p-3 md:p-4 rounded-2xl border flex items-center gap-3 md:gap-4 mb-4 md:mb-6 relative overflow-hidden group",
          latest.type === 'info' ? "bg-blue-50/50 border-blue-100 text-blue-700" :
          latest.type === 'warning' ? "bg-amber-50/50 border-amber-100 text-amber-700" :
          "bg-red-50/50 border-red-100 text-red-700"
        )}
      >
        <div className={cn(
          "size-8 md:size-10 rounded-xl flex items-center justify-center shrink-0",
          latest.type === 'info' ? "bg-blue-100 text-blue-600" :
          latest.type === 'warning' ? "bg-amber-100 text-amber-600" :
          "bg-red-100 text-red-600"
        )}>
          <Icon name={latest.type === 'info' ? 'info' : latest.type === 'warning' ? 'warning' : 'error'} className="text-sm md:text-base" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest opacity-60">Latest Announcement • {latest.timestamp}</span>
            {latest.persistence === 'persistent' && (
              <span className="text-[6px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-white/80 rounded shadow-sm">Sticky</span>
            )}
          </div>
          <p className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest truncate pr-6 md:pr-0">{latest.message}</p>
        </div>
        <div className="flex items-center gap-2">
          {latest.actionLink && (
            <a 
              href={latest.actionLink} 
              target="_blank" 
              rel="noopener noreferrer"
              className="hidden md:flex px-4 py-2 bg-white/80 hover:bg-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all shadow-sm"
            >
              View Details
            </a>
          )}
          <button 
            onClick={() => setDismissedBroadcasts(prev => [...prev, latest.id])}
            className="p-1.5 hover:bg-black/5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
          >
            <Icon name="close" className="text-xs" />
          </button>
        </div>
      </motion.div>
    );
  };

  const visibleTabs = ADMIN_TABS.filter(tab => 
    user?.isAdmin || user?.allowedTabs?.includes(tab.id)
  );

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id as any);
    }
  }, [visibleTabs, activeTab]);

  const handleEditClick = (user: any) => {
    setEditingUser(user);
    setIsAddingUser(false);
    setUserSearchQuery('');
    setEditForm({ 
      displayName: user.displayName, 
      description: user.description,
      isAdmin: !!user.isAdmin,
      username: user.username,
      avatar: user.avatar,
      allowedTabs: user.allowedTabs || [],
      teamRole: user.teamRole || '',
      accessibleTeamMembers: user.accessibleTeamMembers || []
    });
  };

  const handleAddClick = () => {
    setEditingUser(null);
    setIsAddingUser(true);
    setUserSearchQuery('');
    setEditForm({ 
      displayName: '', 
      description: '', 
      isAdmin: false,
      username: '',
      avatar: `https://picsum.photos/seed/${Math.random()}/200`,
      allowedTabs: [],
      accessibleTeamMembers: []
    });
  };

  const teamMembers = users.filter(u => u.isAdmin);

  const handleSendBroadcast = () => {
    if (!broadcastMsg.trim()) return;
    sendBroadcast(broadcastMsg, broadcastType, {
      audience: broadcastAudience,
      persistence: broadcastPersistence,
      actionLink: broadcastActionLink,
      scheduleDate: broadcastSchedule ? broadcastScheduleDate : undefined,
      selectiveAccess: (broadcastAudience === 'users' || broadcastAudience === 'members') ? broadcastSelectedUsers : undefined
    });
    setBroadcastMsg('');
    setBroadcastActionLink('');
    setBroadcastSelectedUsers([]);
    setShowSuccessMessage('Broadcast transmitted successfully');
    setTimeout(() => setShowSuccessMessage(null), 3000);
  };

  const handleTicketReply = () => {
    if (!replyText.trim() || !selectedTicket) return;
    sendTicketMessage(selectedTicket.id, replyText, true);
    setReplyText('');
  };

  const handleTicketStatusUpdate = (ticketId: string, status: 'open' | 'in-progress' | 'resolved') => {
    updateTicketStatus(ticketId, status);
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket({ ...selectedTicket, status });
    }
  };

  const handleDeleteTicket = (ticketId: string) => {
    deleteTicket(ticketId);
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket(null);
    }
  };

  const handleDeleteFeedback = (feedbackId: string) => {
    deleteFeedback(feedbackId);
  };

  const deleteBroadcastRecord = (id: string) => {
    deleteBroadcast(id);
    setShowSuccessMessage('Broadcast record deleted');
    setTimeout(() => setShowSuccessMessage(null), 3000);
  };

  const handleSaveEdit = () => {
    if (isAddingUser) {
      addUser({
        displayName: editForm.displayName,
        description: editForm.description,
        isAdmin: editForm.isAdmin,
        username: editForm.username || `user_${Math.random().toString(36).substr(2, 5)}`,
        avatar: editForm.avatar || `https://picsum.photos/seed/${Math.random()}/200`,
        allowedTabs: editForm.isAdmin ? undefined : editForm.allowedTabs,
        teamRole: editForm.isAdmin ? undefined : editForm.teamRole,
        accessibleTeamMembers: editForm.isAdmin ? undefined : editForm.accessibleTeamMembers,
        joinDate: new Date().toISOString()
      });
      setIsAddingUser(false);
    } else if (editingUser) {
      updateUserByAdmin(editingUser.id, {
        displayName: editForm.displayName,
        description: editForm.description,
        isAdmin: editForm.isAdmin,
        username: editForm.username,
        allowedTabs: editForm.isAdmin ? undefined : editForm.allowedTabs,
        teamRole: editForm.isAdmin ? undefined : editForm.teamRole,
        accessibleTeamMembers: editForm.isAdmin ? undefined : editForm.accessibleTeamMembers
      });
      setEditingUser(null);
    }
  };

  // Derived stats
  const getSummaryStats = () => {
    const baseUsers = users.length;
    switch (timeframe) {
      case 'today':
        return {
          totalUsers: baseUsers * 12 + 450,
          activeUsers: baseUsers * 8,
          cpu: '15%',
          ram: '3.8 GB',
          space: '1.2 TB',
          bandwidth: '120 GB',
          trend: '+8 this hour'
        };
      case 'weekly':
        return {
          totalUsers: baseUsers * 1240 + 8420,
          activeUsers: baseUsers * 428,
          cpu: '32%',
          ram: '5.4 GB',
          space: '1.2 TB',
          bandwidth: '4.2 TB',
          trend: '+840 this week'
        };
      case 'monthly':
        return {
          totalUsers: baseUsers * 5200 + 32000,
          activeUsers: baseUsers * 1850,
          cpu: '38%',
          ram: '6.1 GB',
          space: '1.4 TB',
          bandwidth: '18.5 TB',
          trend: '+3,200 this month'
        };
      case 'yearly':
        return {
          totalUsers: baseUsers * 24000 + 150000,
          activeUsers: baseUsers * 8400,
          cpu: '45%',
          ram: '7.8 GB',
          space: '1.8 TB',
          bandwidth: '142.8 TB',
          trend: '+24,000 this year'
        };
      case 'all_time':
        return {
          totalUsers: baseUsers * 120000 + 820000,
          activeUsers: baseUsers * 45000,
          cpu: '55%',
          ram: '8.2 GB',
          space: '2.1 TB',
          bandwidth: '5.8 PB',
          trend: '+820,000 total'
        };
      default: // today
        return {
          totalUsers: baseUsers * 12 + 450,
          activeUsers: baseUsers * 8,
          cpu: '15%',
          ram: '3.8 GB',
          space: '1.2 TB',
          bandwidth: '120 GB',
          trend: '+8 this hour'
        };
    }
  };

  const stats = getSummaryStats();
  
  const getStatsData = () => {
    switch (timeframe) {
      case 'today': return MOCK_STATS_TODAY;
      case 'weekly': return MOCK_STATS_WEEKLY;
      case 'monthly': return MOCK_STATS_MONTHLY;
      case 'yearly': return MOCK_STATS_YEARLY;
      case 'all_time': return MOCK_STATS_ALL_TIME;
      default: return MOCK_STATS_TODAY;
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-bg-light flex flex-col md:flex-row overflow-hidden font-sans selection:bg-primary/10 selection:text-primary">
      {/* Background Accents */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -right-[5%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -left-[5%] w-[30%] h-[30%] bg-primary/5 blur-[100px] rounded-full" />
      </div>

      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-80 bg-white/80 backdrop-blur-xl border-r border-primary/10 flex-col shrink-0 z-50 relative">
        <div className="p-10">
          <div className="flex items-center gap-4 group cursor-pointer">
            <div className="size-12 rounded-[1.25rem] bg-primary flex items-center justify-center shadow-2xl shadow-primary/30 group-hover:scale-110 transition-transform duration-500">
              <Icon name="security" className="text-white text-2xl" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Control</h1>
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mt-1.5 opacity-80">Protocol v2.5</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto px-6 py-4 space-y-2 no-scrollbar min-h-0">
          <p className="px-4 mb-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Main Infrastructure</p>
          {visibleTabs.map(tab => (
            <button 
              key={`desktop-nav-${tab.id}`}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "w-full flex items-center gap-4 px-5 py-4 rounded-[1.25rem] text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300 group relative overflow-hidden",
                activeTab === tab.id 
                  ? "bg-primary text-white shadow-2xl shadow-primary/20" 
                  : "text-neutral-muted hover:bg-primary/5 hover:text-primary"
              )}
            >
              <Icon name={tab.icon} className={cn("text-xl transition-transform duration-300 group-hover:scale-110", activeTab === tab.id ? "text-white" : "text-neutral-muted group-hover:text-primary")} />
              <span className="relative z-10">{tab.label}</span>
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="active-indicator" 
                  className="absolute right-0 w-1.5 h-8 bg-white/50 rounded-l-full" 
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          ))}
        </nav>

        <div className="p-8 space-y-6">
          <div className="p-5 rounded-3xl bg-primary/5 border border-white shadow-sm group cursor-pointer hover:bg-white hover:shadow-xl hover:shadow-primary/10 transition-all duration-500">
            <div className="flex items-center gap-4 mb-4">
              <div className="size-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <Icon name="verified_user" className="text-lg" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight">Admin Session</p>
                <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mt-0.5">Secure Active</p>
              </div>
            </div>
            <div className="h-1.5 w-full bg-primary/10 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: '85%' }}
                className="h-full bg-emerald-500"
              />
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="w-full flex items-center justify-center gap-3 py-5 rounded-[1.25rem] bg-primary/10 text-primary text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white hover:shadow-2xl hover:shadow-red-500/30 transition-all duration-500 group"
          >
            <Icon name="logout" className="text-lg group-hover:-translate-x-1 transition-transform" />
            Exit Command
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10 h-full">
        {/* Header - Mobile & Desktop Top Bar */}
        <header className="px-8 py-6 flex items-center justify-between bg-white/60 backdrop-blur-xl border-b border-primary/10 sticky top-0 z-40 min-h-[100px]">
          <div className="flex items-center gap-6">
            <button onClick={onClose} className="md:hidden size-12 rounded-2xl bg-white shadow-lg shadow-primary/5 flex items-center justify-center text-neutral-muted hover:bg-primary hover:text-white transition-all duration-300">
              <Icon name="arrow_back" />
            </button>
            <div className="md:hidden">
              <h1 className="text-xl font-black tracking-tighter text-slate-900 uppercase leading-none italic">Control</h1>
              <p className="text-[9px] font-black text-primary uppercase tracking-[0.3em] mt-1.5">Panel</p>
            </div>
            <div className="hidden md:block">
              <div className="flex items-center gap-3 mb-1">
                <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">
                  {visibleTabs.find(t => t.id === activeTab)?.label}
                </h2>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-[10px] font-bold text-neutral-muted uppercase tracking-[0.3em]">
                  System Infrastructure • {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                </p>
                <div className="h-3 w-px bg-primary/10" />
                <div className="flex items-center gap-1.5">
                  <Icon name="dns" className="text-[10px] text-primary" />
                  <span className="text-[9px] font-black text-primary uppercase tracking-widest">Node-04 Active</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-[9px] font-black text-neutral-muted uppercase tracking-[0.3em] mb-1">Network Integrity</span>
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={`integrity-bar-${i}`} className={cn("w-1 h-3 rounded-full", i <= 4 ? "bg-emerald-500" : "bg-primary/10")} />
                  ))}
                </div>
                <span className="text-xs font-black text-emerald-600 uppercase tracking-tighter">{systemHealth}% Optimal</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button className="size-12 rounded-2xl bg-white shadow-lg shadow-primary/5 flex items-center justify-center text-neutral-muted hover:text-primary hover:shadow-primary/20 transition-all duration-300 relative group">
                <Icon name="notifications" className="group-hover:rotate-12 transition-transform" />
                <div className="absolute top-3 right-3 size-2.5 bg-red-500 rounded-full border-2 border-white shadow-sm" />
              </button>
              
              <div className="h-12 w-px bg-primary/10 mx-1 hidden sm:block" />
              
              <div className="flex items-center gap-3 pl-1 group cursor-pointer">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight">{user?.displayName || 'Admin'}</span>
                  <span className="text-[8px] font-black text-primary uppercase tracking-widest opacity-70">Admins</span>
                </div>
                <div className="size-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/20 group-hover:scale-105 transition-transform duration-300">
                  <Icon name="account_circle" className="text-2xl" />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Navigation - Bottom Bar */}
        <nav className="md:hidden fixed bottom-6 left-4 right-4 z-[100] bg-primary/95 backdrop-blur-2xl rounded-[2.5rem] px-4 py-3 flex justify-around items-center shadow-2xl shadow-primary/40 border border-white/10">
          {visibleTabs.slice(0, 4).map(tab => (
            <button 
              key={`mobile-nav-${tab.id}`}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex flex-col items-center gap-1 p-2.5 rounded-2xl transition-all relative min-w-[64px]",
                activeTab === tab.id ? "text-white" : "text-white/50"
              )}
            >
              <Icon name={tab.icon} className={cn("text-2xl transition-transform", activeTab === tab.id ? "scale-110" : "opacity-70")} />
              <span className="text-[7px] font-black uppercase tracking-[0.2em]">{tab.label.split(' ')[0]}</span>
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="mobile-active-glow"
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_12px_#FFFFFF]"
                />
              )}
            </button>
          ))}
          
          {visibleTabs.length > 4 && (
            <div className="relative">
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className={cn(
                  "flex flex-col items-center gap-1 p-2.5 rounded-2xl transition-all min-w-[64px]",
                  visibleTabs.slice(4).some(t => t.id === activeTab) ? "text-white" : "text-white/50"
                )}
              >
                <Icon name="grid_view" className="text-2xl opacity-70" />
                <span className="text-[7px] font-black uppercase tracking-[0.2em]">More</span>
              </button>

              <AnimatePresence>
                {isMobileMenuOpen && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 bg-black/60 backdrop-blur-md z-40" 
                      onClick={() => setIsMobileMenuOpen(false)} 
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 100 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 100 }}
                      className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[3rem] shadow-2xl p-6 z-50 max-h-[70vh] overflow-y-auto no-scrollbar"
                    >
                      <div className="flex items-center justify-between mb-8 px-2">
                        <p className="text-[11px] font-black text-slate-900 uppercase tracking-[0.4em]">Extended Command Center</p>
                        <button onClick={() => setIsMobileMenuOpen(false)} className="size-10 rounded-full bg-primary/5 flex items-center justify-center text-neutral-muted">
                          <Icon name="close" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {visibleTabs.slice(4).map((tab) => (
                          <button
                            key={`mobile-more-${tab.id}`}
                            onClick={() => {
                              setActiveTab(tab.id as any);
                              setIsMobileMenuOpen(false);
                            }}
                            className={cn(
                              "flex flex-col items-center gap-3 p-6 rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all border-2",
                              activeTab === tab.id 
                                ? "bg-primary text-white border-primary shadow-xl shadow-primary/20" 
                                : "bg-primary/5 text-neutral-muted border-transparent hover:border-primary/20"
                            )}
                          >
                            <Icon name={tab.icon} className="text-2xl" />
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
        </nav>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 pb-32 md:pb-8 space-y-6 sm:space-y-8 md:space-y-10 no-scrollbar relative min-h-0 touch-action-pan-y">
          {activeTab === 'monitor' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6 sm:space-y-10"
            >
              <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 sm:gap-8">
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="size-10 sm:size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <Icon name="monitoring" className="text-xl sm:text-2xl" />
                    </div>
                    <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 uppercase italic tracking-tighter">Network Vitals</h3>
                  </div>
                  <p className="text-[9px] sm:text-[11px] font-black text-neutral-muted uppercase tracking-[0.3em] sm:tracking-[0.4em] pl-1">Live infrastructure telemetry & node performance</p>
                </div>
                
                <div className="flex items-center bg-white shadow-2xl shadow-primary/5 border border-primary/10 p-1 rounded-xl sm:rounded-[1.5rem] self-start overflow-x-auto no-scrollbar max-w-full">
                  {(['today', 'weekly', 'monthly', 'yearly', 'all_time'] as const).map((tf) => {
                    const label = tf === 'today' ? 'Today' : 
                                 tf === 'all_time' ? 'All Time' : 
                                 tf.replace('ly', '');
                    return (
                      <button
                        key={`timeframe-${tf}`}
                        onClick={() => setTimeframe(tf)}
                        className={cn(
                          "px-4 py-2 sm:px-6 sm:py-3 text-[8px] sm:text-[10px] font-black uppercase tracking-[0.1em] sm:tracking-[0.15em] rounded-lg sm:rounded-2xl transition-all duration-300 whitespace-nowrap",
                          timeframe === tf 
                            ? "bg-primary text-white shadow-xl shadow-primary/20" 
                            : "text-neutral-muted hover:text-primary hover:bg-primary/5"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-8">
                {[
                  { label: 'Network Population', value: stats.totalUsers.toLocaleString(), trend: stats.trend, icon: 'group', color: 'primary' },
                  { label: 'Active Members', value: users.filter(u => u.isInApp).length, trend: 'Live Processing', icon: 'bolt', color: 'emerald', pulse: true },
                  { label: 'System Load', value: stats.cpu, trend: 'CPU Usage', icon: 'memory', color: 'primary', progress: stats.cpu },
                  { label: 'Throughput', value: stats.bandwidth, trend: '840 Mbps Peak', icon: 'speed', color: 'primary' },
                ].map((stat, i) => (
                  <Card key={`stat-card-${i}`} className="p-6 sm:p-10 flex flex-col justify-between min-h-[160px] sm:min-h-[220px] bg-white shadow-2xl shadow-primary/5 border-none relative overflow-hidden group hover:scale-[1.02] transition-all duration-500 rounded-[1.5rem] sm:rounded-[2.5rem]">
                    <div className="absolute -top-4 -right-4 p-6 sm:p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-700 group-hover:scale-125 group-hover:-rotate-12">
                      <Icon name={stat.icon} className="text-[6rem] sm:text-[10rem]" />
                    </div>
                    <div className="space-y-1 sm:space-y-2 relative z-10">
                      <p className={cn("text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.25em]", stat.color === 'emerald' ? "text-emerald-500" : "text-neutral-muted")}>
                        {stat.label}
                      </p>
                      <h3 className={cn("text-3xl sm:text-5xl font-black italic tracking-tighter", stat.color === 'emerald' ? "text-emerald-500" : "text-slate-900")}>
                        {stat.value}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 relative z-10">
                      {stat.pulse ? (
                        <div className="size-2 sm:size-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
                      ) : stat.progress ? (
                        <div className="flex-1 h-1 sm:h-1.5 bg-primary/10 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: stat.progress }}
                            className="h-full bg-primary"
                          />
                        </div>
                      ) : (
                        <Icon name="trending_up" className="text-emerald-500 text-xs sm:text-sm" />
                      )}
                      <span className="text-[8px] sm:text-[9px] font-black text-neutral-muted uppercase tracking-[0.15em] sm:tracking-[0.2em]">{stat.trend}</span>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 sm:gap-10">
                <Card className="xl:col-span-2 p-6 sm:p-10 space-y-6 sm:space-y-10 bg-white shadow-2xl shadow-primary/5 border-none rounded-[2rem] sm:rounded-[3rem]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 sm:gap-8">
                    <div className="space-y-1 sm:space-y-2">
                      <h3 className="font-black text-slate-900 uppercase italic tracking-tight text-lg sm:text-xl">Resource Allocation</h3>
                      <p className="text-[8px] sm:text-[9px] font-black text-neutral-muted uppercase tracking-[0.3em] sm:tracking-[0.4em]">Protocol throughput & node analysis</p>
                    </div>
                    <div className="flex gap-4 sm:gap-6 flex-wrap bg-primary/5 p-2 sm:p-3 rounded-xl sm:rounded-2xl border border-primary/10">
                      {[
                        { label: 'Members', color: 'bg-primary' },
                        { label: 'CPU', color: 'bg-amber-500' },
                        { label: 'Bandwidth', color: 'bg-emerald-500' }
                      ].map((l, i) => (
                        <div key={`latency-bar-${i}`} className="flex items-center gap-2 sm:gap-2.5">
                          <div className={cn("size-2 sm:size-2.5 rounded-full shadow-sm", l.color)} />
                          <span className="text-[8px] sm:text-[9px] font-black uppercase text-neutral-muted tracking-widest">{l.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="h-[250px] sm:h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={getStatsData()}>
                        <defs>
                          <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#E67E6E" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#E67E6E" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorCPU" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorBandwidth" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#FFF1E7" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 8, fontWeight: 900, fill: '#E67E6E', opacity: 0.5}} 
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 8, fontWeight: 900, fill: '#E67E6E', opacity: 0.5}} 
                          dx={-10}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '16px', 
                            border: 'none', 
                            boxShadow: '0 25px 50px -12px rgb(230 126 110 / 0.15)', 
                            padding: '16px',
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            backdropFilter: 'blur(10px)'
                          }}
                          itemStyle={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}
                        />
                        <Area type="monotone" dataKey="users" stroke="#E67E6E" fillOpacity={1} fill="url(#colorUsers)" strokeWidth={4} />
                        <Area type="monotone" dataKey="cpu" stroke="#f59e0b" fillOpacity={1} fill="url(#colorCPU)" strokeWidth={3} />
                        <Area type="monotone" dataKey="bandwidth" stroke="#10b981" fillOpacity={1} fill="url(#colorBandwidth)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <div className="space-y-6 sm:space-y-10">
                  <Card className="p-6 sm:p-10 space-y-6 sm:space-y-8 bg-white shadow-2xl shadow-primary/5 border-none rounded-[2rem] sm:rounded-[3rem]">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-slate-900 uppercase italic tracking-tight text-lg sm:text-xl">System Logs</h3>
                      <div className="size-8 sm:size-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                        <Icon name="history" />
                      </div>
                    </div>
                    <div className="space-y-6 sm:space-y-8">
                      {realSystemLogs.map((log, i) => (
                        <div key={`system-log-${i}`} className="flex gap-4 sm:gap-5 group cursor-pointer">
                          <div className={cn("size-12 sm:size-14 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500 group-hover:rotate-12 group-hover:scale-110 shadow-sm", log.bg, log.color)}>
                            <Icon name={log.icon} className="text-xl sm:text-2xl" />
                          </div>
                          <div className="min-w-0 flex-1 py-1">
                            <p className="text-[10px] sm:text-[11px] font-black text-slate-900 truncate uppercase tracking-tight group-hover:text-primary transition-colors">{log.text}</p>
                            <p className="text-[8px] sm:text-[9px] text-neutral-muted font-black uppercase tracking-[0.2em] mt-1 sm:mt-1.5">{log.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button className="w-full bg-primary text-white hover:bg-primary-dark border-none shadow-xl shadow-primary/20 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.25em] h-14 sm:h-16 rounded-xl sm:rounded-[1.5rem] transition-all duration-500">
                      View Full Activity
                    </Button>
                  </Card>

                  <Card className="p-6 sm:p-10 bg-primary text-white shadow-2xl shadow-primary/30 border-none rounded-[2rem] sm:rounded-[3rem] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 sm:p-10 opacity-10 group-hover:scale-125 transition-transform duration-1000">
                      <Icon name="auto_awesome" className="text-[6rem] sm:text-[8rem]" />
                    </div>
                    <div className="relative z-10">
                      <h3 className="text-xl sm:text-2xl font-black uppercase italic tracking-tighter mb-2 sm:mb-3">Protocol v2.5</h3>
                      <p className="text-[10px] sm:text-[11px] font-bold opacity-80 uppercase tracking-[0.15em] leading-relaxed mb-6 sm:mb-8">
                        System is running at peak efficiency. All nodes are synchronized across global clusters.
                      </p>
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="size-2.5 sm:size-3 rounded-full bg-white animate-pulse shadow-[0_0_15px_#FFFFFF]" />
                        <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em]">Live Sync Active</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </motion.div>
          )}

        {activeTab === 'helpdesk' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-10"
          >
            <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 items-start lg:items-end justify-between">
              <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="size-10 sm:size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Icon name="support_agent" className="text-xl sm:text-2xl" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 uppercase italic tracking-tighter">Support Command</h3>
                </div>
                <p className="text-[9px] sm:text-[11px] font-black text-neutral-muted uppercase tracking-[0.3em] sm:tracking-[0.4em] pl-1">Member queries, technical tickets & feedback loop</p>
              </div>
              <div className="relative w-full lg:w-96 group">
                <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-muted group-focus-within:text-primary transition-colors" />
                <input 
                  type="text"
                  placeholder="SEARCH TICKETS..."
                  value={ticketSearchQuery}
                  onChange={(e) => setTicketSearchQuery(e.target.value)}
                  className="w-full bg-white border border-primary/10 rounded-2xl pl-12 pr-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] outline-none focus:ring-4 ring-primary/10 focus:border-primary/30 transition-all shadow-xl shadow-primary/5"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex items-center bg-white shadow-xl shadow-primary/5 border border-primary/10 p-1.5 rounded-2xl overflow-x-auto no-scrollbar w-full sm:w-auto">
                {(['all', 'open', 'in-progress', 'resolved'] as const).map((status) => (
                  <button
                    key={`helpdesk-status-${status}`}
                    onClick={() => setTicketFilter(status)}
                    className={cn(
                      "px-6 py-3 text-[10px] font-black uppercase tracking-[0.15em] rounded-xl transition-all duration-300 whitespace-nowrap",
                      ticketFilter === status 
                        ? "bg-primary text-white shadow-lg shadow-primary/20" 
                        : "text-neutral-muted hover:text-primary hover:bg-primary/5"
                    )}
                  >
                    {status === 'all' ? 'All Tickets' : status.replace('-', ' ')}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-auto">
                <button 
                  onClick={() => setIsTicketFilterOpen(!isTicketFilterOpen)}
                  className={cn(
                    "w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3 rounded-2xl border border-primary/10 bg-white shadow-xl shadow-primary/5 transition-all hover:bg-primary/5",
                    statusFilter !== 'all' && "ring-2 ring-primary/20 border-primary/30"
                  )}
                >
                  <Icon name="filter_list" className={cn("text-lg", statusFilter !== 'all' ? "text-primary" : "text-neutral-muted")} />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
                    {statusFilter === 'all' ? 'Member Status' : statusFilter.replace('_', ' ')}
                  </span>
                  <Icon name={isTicketFilterOpen ? "expand_less" : "expand_more"} className="text-sm text-neutral-muted" />
                </button>

                <AnimatePresence>
                  {isTicketFilterOpen && (
                    <>
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsTicketFilterOpen(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-full mt-3 w-56 bg-white rounded-[2rem] shadow-2xl border border-primary/10 p-2 z-50 overflow-hidden"
                      >
                        {(['all', 'online', 'in_app', 'inactive'] as const).map((f) => (
                          <button
                            key={`helpdesk-user-status-${f}`}
                            onClick={() => {
                              setStatusFilter(f);
                              setIsTicketFilterOpen(false);
                            }}
                            className={cn(
                              "w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                              statusFilter === f ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-neutral-muted hover:bg-primary/5 hover:text-primary"
                            )}
                          >
                            <Icon name={
                              f === 'all' ? 'group' : 
                              f === 'online' ? 'online_prediction' : 
                              f === 'in_app' ? 'bolt' : 'person_off'
                            } className="text-lg" />
                            {f.replace('_', ' ')}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 sm:gap-10">
              <div className="xl:col-span-2 space-y-4 sm:space-y-6">
                <AnimatePresence mode="popLayout">
                  {tickets
                    .filter(t => (ticketFilter === 'all' || t.status === ticketFilter))
                    .filter(t => t.description.toLowerCase().includes(ticketSearchQuery.toLowerCase()) || t.id.toLowerCase().includes(ticketSearchQuery.toLowerCase()))
                    .filter(t => {
                      const u = users.find(user => user.id === t.userId);
                      if (statusFilter === 'all') return true;
                      if (statusFilter === 'online') return u?.isOnline;
                      if (statusFilter === 'in_app') return u?.isInApp;
                      if (statusFilter === 'inactive') return isUserInactive(u?.lastSeen);
                      return true;
                    })
                    .map((ticket) => {
                      const ticketUser = users.find(u => u.id === ticket.userId);
                      return (
                        <motion.div
                          key={`ticket-card-${ticket.id}`}
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="group relative"
                        >
                          <Card className="p-4 sm:p-8 bg-white hover:bg-primary/5 border-none shadow-2xl shadow-primary/5 rounded-2xl sm:rounded-[2.5rem] transition-all duration-500 cursor-pointer overflow-hidden" onClick={() => setSelectedTicket(ticket)}>
                            <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
                              <div className="flex items-start gap-3 sm:gap-5 min-w-0 flex-1">
                                <Avatar src={ticketUser?.avatar || ''} className="size-10 sm:size-16 rounded-xl sm:rounded-[1.25rem] shadow-lg" />
                                <div className="min-w-0 flex-1 py-0.5 sm:py-1">
                                  <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                                    <span className="text-[7px] sm:text-[9px] font-black text-primary uppercase tracking-[0.2em] sm:tracking-[0.3em]">Ticket #{ticket.id}</span>
                                    <div className="size-1 rounded-full bg-primary/20" />
                                    <span className="text-[7px] sm:text-[9px] font-black text-neutral-muted uppercase tracking-[0.2em]">{ticket.timestamp}</span>
                                  </div>
                                  <h4 className="text-sm sm:text-lg font-black text-slate-900 uppercase italic tracking-tight mb-1 sm:mb-2 group-hover:text-primary transition-colors line-clamp-1">{ticket.category}</h4>
                                  <p className="text-[9px] sm:text-[11px] font-bold text-neutral-muted uppercase tracking-wide line-clamp-1 opacity-70">{ticket.description}</p>
                                </div>
                              </div>
                              <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 sm:gap-4 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-primary/5">
                                <div className={cn(
                                  "px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl text-[7px] sm:text-[9px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] shadow-sm",
                                  ticket.status === 'open' ? "bg-primary text-white shadow-primary/20" :
                                  ticket.status === 'in-progress' ? "bg-amber-500 text-white shadow-amber-500/20" :
                                  "bg-emerald-500 text-white shadow-emerald-500/20"
                                )}>
                                  {ticket.status}
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="size-7 sm:size-8 rounded-lg sm:rounded-xl bg-primary/5 flex items-center justify-center text-neutral-muted group-hover:bg-primary group-hover:text-white transition-all duration-500">
                                    <Icon name="chevron_right" className="text-base sm:text-lg" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Card>
                        </motion.div>
                      );
                    })}
                </AnimatePresence>
              </div>

              <div className="space-y-6 sm:space-y-10">
                <Card className="p-6 sm:p-10 space-y-6 sm:space-y-8 bg-white shadow-2xl shadow-primary/5 border-none rounded-2xl sm:rounded-[3rem]">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-slate-900 uppercase italic tracking-tight text-lg sm:text-xl">Recent Feedback</h3>
                    <div className="size-8 sm:size-10 rounded-lg sm:rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                      <Icon name="rate_review" className="text-lg sm:text-xl" />
                    </div>
                  </div>
                  <div className="space-y-6 sm:space-y-8">
                    {feedback.map((f, i) => {
                      const u = users.find(user => user.id === f.userId);
                      return (
                        <div key={`feedback-item-${f.id}`} className="group relative">
                          <div className="flex gap-4 sm:gap-5">
                            <Avatar src={u?.avatar || ''} className="size-10 sm:size-12 rounded-lg sm:rounded-xl shadow-md" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[9px] sm:text-[10px] font-black text-slate-900 uppercase tracking-tight truncate">{u?.displayName}</span>
                                <span className="text-[7px] sm:text-[8px] font-black text-neutral-muted uppercase tracking-widest">{f.timestamp}</span>
                              </div>
                              <div className="flex gap-0.5 mb-1.5 sm:mb-2">
                                <span className="text-base sm:text-lg">{f.emoji}</span>
                              </div>
                              <p className="text-[9px] sm:text-[10px] font-bold text-neutral-muted leading-relaxed italic">"{f.text}"</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => deleteFeedback(f.id)}
                            className="absolute -right-1 -top-1 size-7 sm:size-8 rounded-lg sm:rounded-xl bg-white shadow-lg border border-primary/5 flex items-center justify-center text-neutral-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all duration-300"
                          >
                            <Icon name="delete" className="text-xs sm:text-sm" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <Button className="w-full bg-primary/5 text-primary hover:bg-primary hover:text-white border-none shadow-none text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] h-14 sm:h-16 rounded-xl sm:rounded-2xl transition-all duration-500">
                    View All Feedback
                  </Button>
                </Card>
              </div>
            </div>

            <AnimatePresence>
              {selectedTicket && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-primary/20 backdrop-blur-sm"
                  onClick={() => setSelectedTicket(null)}
                >
                  <Card 
                    className="w-full max-w-lg p-5 sm:p-8 space-y-5 sm:space-y-6 bg-white shadow-2xl border-none rounded-t-[2rem] sm:rounded-[2.5rem] max-h-[95vh] sm:max-h-[90vh] overflow-y-auto no-scrollbar"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between sticky top-0 bg-white z-10 pb-4 border-b border-primary/5">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "size-10 sm:size-12 rounded-xl flex items-center justify-center",
                          selectedTicket.status === 'open' ? "bg-primary/10 text-primary" : 
                          selectedTicket.status === 'in-progress' ? "bg-amber-50 text-amber-500" : "bg-emerald-50 text-emerald-500"
                        )}>
                          <Icon name={selectedTicket.status === 'open' ? 'mail' : selectedTicket.status === 'in-progress' ? 'schedule' : 'check_circle'} className="text-lg sm:text-xl" />
                        </div>
                        <div>
                          <h3 className="font-black text-slate-800 uppercase italic text-sm sm:text-lg tracking-tight">{selectedTicket.category}</h3>
                          <p className="text-[8px] sm:text-[10px] font-black text-neutral-muted uppercase tracking-widest">Ticket #{selectedTicket.id}</p>
                        </div>
                      </div>
                      <button onClick={() => setSelectedTicket(null)} className="size-10 sm:size-12 rounded-full hover:bg-primary/5 flex items-center justify-center text-neutral-muted hover:text-primary transition-colors">
                        <Icon name="close" className="text-xl" />
                      </button>
                    </div>

                    <div className="space-y-5 sm:space-y-6">
                      <div className="bg-primary/5 p-4 sm:p-6 rounded-2xl border border-primary/10 max-h-60 sm:max-h-80 overflow-y-auto no-scrollbar space-y-4 sm:space-y-6">
                        <div className="space-y-2">
                          <p className="text-[9px] sm:text-[11px] font-black text-primary uppercase tracking-widest">Initial Description:</p>
                          <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">{selectedTicket.description}</p>
                        </div>
                        
                        {selectedTicket.messages && selectedTicket.messages.length > 0 && (
                          <div className="space-y-4 pt-4 border-t border-primary/10">
                            <p className="text-[9px] sm:text-[11px] font-black text-primary uppercase tracking-widest">Message History:</p>
                            {selectedTicket.messages.map((msg: any) => (
                              <div key={`ticket-msg-${msg.id}`} className={cn(
                                "p-4 rounded-xl text-xs sm:text-sm",
                                msg.isAdmin ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-white mr-4 border border-primary/10"
                              )}>
                                <div className="flex justify-between items-center mb-2">
                                  <span className={cn("font-black uppercase text-[8px] sm:text-[10px] tracking-widest", msg.isAdmin ? "text-white/80" : "text-primary")}>{msg.senderName}</span>
                                  <span className={cn("text-[8px] sm:text-[10px]", msg.isAdmin ? "text-white/60" : "text-neutral-muted")}>{msg.timestamp}</span>
                                </div>
                                <p className={msg.isAdmin ? "text-white leading-relaxed" : "text-slate-700 leading-relaxed"}>{msg.text}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] sm:text-[11px] font-black text-neutral-muted uppercase tracking-widest ml-1">Send Message / Clarification</label>
                        <textarea 
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="TYPE YOUR MESSAGE HERE..."
                          className="w-full h-28 sm:h-32 bg-primary/5 border border-primary/10 rounded-2xl p-4 sm:p-5 text-[10px] sm:text-xs font-bold uppercase tracking-widest outline-none focus:ring-2 ring-primary/20 resize-none"
                        />
                      </div>

                      <div className="flex flex-col gap-3">
                        <Button 
                          disabled={!replyText.trim()}
                          onClick={() => {
                            sendTicketMessage(selectedTicket.id, replyText, true);
                            setReplyText('');
                            // Refresh selected ticket to show new message
                            const updatedTicket = tickets.find(t => t.id === selectedTicket.id);
                            setSelectedTicket(updatedTicket);
                          }}
                          className="w-full bg-primary text-white border-none shadow-lg shadow-primary/20 text-[10px] sm:text-[12px] font-black uppercase tracking-widest h-12 sm:h-14 rounded-xl sm:rounded-2xl"
                        >
                          Send Message
                        </Button>
                        
                        <div className="flex gap-3">
                          <Button 
                            onClick={() => {
                              if (replyText.trim()) {
                                sendTicketMessage(selectedTicket.id, replyText, true);
                              }
                              updateTicketStatus(selectedTicket.id, 'resolved');
                              setSelectedTicket(null);
                              setReplyText('');
                            }}
                            className="flex-1 bg-emerald-500 text-white border-none shadow-lg shadow-emerald-500/20 text-[10px] sm:text-[12px] font-black uppercase tracking-widest h-12 sm:h-14 rounded-xl sm:rounded-2xl"
                          >
                            Resolve
                          </Button>
                          <Button 
                            onClick={() => {
                              if (replyText.trim()) {
                                sendTicketMessage(selectedTicket.id, replyText, true);
                              }
                              updateTicketStatus(selectedTicket.id, 'in-progress');
                              setSelectedTicket(null);
                              setReplyText('');
                            }}
                            className="flex-1 bg-amber-500 text-white border-none shadow-lg shadow-amber-500/20 text-[10px] sm:text-[12px] font-black uppercase tracking-widest h-12 sm:h-14 rounded-xl sm:rounded-2xl"
                          >
                            In-Progress
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 gap-4">
              {tickets
                .filter(t => {
                  // Ticket Status Filter
                  if (ticketFilter !== 'all' && t.status !== ticketFilter) return false;

                  // User Status Filter
                  const u = users.find(user => user.id === t.userId);
                  if (!u) return false;
                  if (statusFilter === 'online' && !(u.isOnline && !u.isInApp)) return false;
                  if (statusFilter === 'in_app' && !u.isInApp) return false;
                  if (statusFilter === 'inactive' && !isUserInactive(u.lastSeen)) return false;

                  return true;
                })
                .filter(t => t.description.toLowerCase().includes(ticketSearchQuery.toLowerCase()) || t.category.toLowerCase().includes(ticketSearchQuery.toLowerCase()))
                .length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-300 gap-2">
                  <Icon name="support_agent" className="text-4xl" />
                  <p className="text-[10px] font-black uppercase tracking-widest">No support tickets found</p>
                </div>
              ) : (
                tickets
                  .filter(t => {
                    // Ticket Status Filter
                    if (ticketFilter !== 'all' && t.status !== ticketFilter) return false;

                    // User Status Filter
                    const u = users.find(user => user.id === t.userId);
                    if (!u) return false;
                    if (statusFilter === 'online' && !(u.isOnline && !u.isInApp)) return false;
                    if (statusFilter === 'in_app' && !u.isInApp) return false;
                    if (statusFilter === 'inactive' && !isUserInactive(u.lastSeen)) return false;

                    return true;
                  })
                  .filter(t => t.description.toLowerCase().includes(ticketSearchQuery.toLowerCase()) || t.category.toLowerCase().includes(ticketSearchQuery.toLowerCase()))
                  .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) // Oldest tickets first
                  .map((ticket) => {
                    const ticketUser = users.find(u => u.id === ticket.userId);
                    return (
                      <Card key={`ticket-list-item-${ticket.id}`} className="p-2.5 md:p-4 flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4 hover:border-primary/20 transition-all bg-white/50 backdrop-blur-sm">
                        <div className={cn(
                          "size-8 md:size-12 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0",
                          ticket.status === 'open' ? "bg-red-50 text-red-500" : 
                          ticket.status === 'in-progress' ? "bg-amber-50 text-amber-500" : "bg-emerald-50 text-emerald-500"
                        )}>
                          <Icon name={ticket.status === 'open' ? 'mail' : ticket.status === 'in-progress' ? 'schedule' : 'check_circle'} className="text-sm md:text-base" />
                        </div>
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedTicket(ticket)}>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm md:text-sm font-black text-slate-800 truncate uppercase italic">{ticket.category}</h4>
                            <span className={cn(
                              "text-[8px] md:text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full",
                              ticket.status === 'open' ? "bg-red-100 text-red-600" : 
                              ticket.status === 'in-progress' ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"
                            )}>
                              {ticket.status}
                            </span>
                          </div>
                          <p className="text-[10px] md:text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-1 md:mt-1">{ticket.description}</p>
                          <p className="text-[8px] md:text-[8px] font-bold text-neutral-muted uppercase tracking-widest mt-2 md:mt-2">
                            From: {ticketUser?.displayName || 'Unknown Member'} ({ticketUser?.username || 'unknown'}) • {ticket.timestamp}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto">
                          {ticket.status !== 'resolved' && (
                            <Button 
                              onClick={() => updateTicketStatus(ticket.id, ticket.status === 'open' ? 'in-progress' : 'resolved')}
                              className={cn(
                                "flex-1 md:flex-none border-none shadow-none text-[10px] md:text-[10px] font-black uppercase tracking-widest h-10 md:h-10",
                                ticket.status === 'open' ? "bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white"
                              )}
                            >
                              {ticket.status === 'open' ? 'Mark In-Progress' : 'Mark Resolved'}
                            </Button>
                          )}
                          <button 
                            onClick={() => deleteTicket(ticket.id)}
                            className="size-8 md:size-10 rounded-full hover:bg-red-50 flex items-center justify-center text-red-400 transition-all"
                            title="Delete Ticket"
                          >
                            <Icon name="delete" className="text-sm md:text-base" />
                          </button>
                        </div>
                      </Card>
                    );
                  })
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="feedback" className="text-slate-400" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-muted">Recent Member Feedback</h4>
                </div>
                <p className="text-[8px] font-black text-neutral-muted uppercase tracking-widest">{feedback.length} Entries</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {feedback.length === 0 ? (
                  <div className="col-span-full h-32 flex flex-col items-center justify-center text-slate-300 gap-2 bg-white/30 rounded-2xl border border-dashed border-primary/10">
                    <p className="text-[10px] font-black uppercase tracking-widest">No feedback received yet</p>
                  </div>
                ) : (
                  feedback.map((fb) => {
                    const fbUser = users.find(u => u.id === fb.userId);
                    return (
                      <Card key={`feedback-card-${fb.id}`} className="p-2.5 md:p-4 bg-white/50 backdrop-blur-sm border-none md:border md:border-primary/10 relative group">
                        <div className="flex gap-3 md:gap-4">
                          <div className="text-xl md:text-2xl shrink-0">{fb.emoji}</div>
                          <div className="space-y-1 flex-1">
                            <p className="text-[10px] md:text-[10px] font-bold text-slate-700 uppercase leading-relaxed">{fb.text}</p>
                            <p className="text-[8px] md:text-[8px] font-black text-neutral-muted uppercase tracking-widest">
                              {fbUser?.displayName || 'Unknown Member'} • {fb.timestamp}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all absolute top-2 right-2">
                            <button 
                              onClick={() => deleteFeedback(fb.id)}
                              className="size-6 md:size-8 rounded-full hover:bg-red-50 flex items-center justify-center text-red-400"
                              title="Delete Feedback"
                            >
                              <Icon name="delete" className="text-xs md:text-sm" />
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'user_manage' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-10"
          >
            <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 items-start lg:items-end justify-between">
              <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="size-10 sm:size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Icon name="manage_accounts" className="text-xl sm:text-2xl" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 uppercase italic tracking-tighter">Member Registry</h3>
                </div>
                <p className="text-[9px] sm:text-[11px] font-black text-neutral-muted uppercase tracking-[0.3em] sm:tracking-[0.4em] pl-1">Global database of all protocol participants</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                <div className="relative flex-1 sm:w-80 group">
                  <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-muted group-focus-within:text-primary transition-colors" />
                  <input 
                    type="text"
                    placeholder="SEARCH MEMBERS..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-primary/10 rounded-2xl pl-12 pr-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] outline-none focus:ring-4 ring-primary/10 transition-all shadow-xl shadow-primary/5"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
              {[
                { label: 'Total Members', value: users.length, icon: 'group', color: 'primary' },
                { label: 'Active', value: users.filter(u => u.isInApp).length, icon: 'bolt', color: 'emerald' },
                { label: 'Online', value: users.filter(u => u.isOnline).length, icon: 'blue', color: 'blue' },
                { label: 'Reported', value: users.filter(u => u.isReported).length, icon: 'report', color: 'amber' },
                { label: 'Flagged', value: users.filter(u => u.isAdminFlagged).length, icon: 'flag', color: 'orange' },
                { label: 'Banned', value: users.filter(u => u.isBanned).length, icon: 'block', color: 'red' },
                { label: 'Inactive', value: users.filter(u => isUserInactive(u.lastSeen)).length, icon: 'person_off', color: 'neutral' },
              ].map((stat, i) => (
                <Card key={`member-stat-card-${i}`} className="p-4 sm:p-6 flex flex-col items-center justify-center text-center space-y-2 sm:space-y-3 bg-white shadow-xl shadow-primary/5 border-none rounded-2xl sm:rounded-3xl group hover:scale-105 transition-all duration-500">
                  <div className={cn("size-10 sm:size-12 rounded-xl sm:rounded-2xl flex items-center justify-center mb-1", 
                    stat.color === 'emerald' ? "bg-emerald-50 text-emerald-500" :
                    stat.color === 'blue' ? "bg-blue-50 text-blue-500" :
                    stat.color === 'amber' ? "bg-amber-50 text-amber-500" :
                    stat.color === 'orange' ? "bg-orange-50 text-orange-500" :
                    stat.color === 'red' ? "bg-red-50 text-red-500" :
                    stat.color === 'primary' ? "bg-primary/10 text-primary" :
                    "bg-primary/5 text-neutral-muted"
                  )}>
                    <Icon name={stat.icon} className="text-xl sm:text-2xl" />
                  </div>
                  <h4 className="text-xl sm:text-2xl font-black text-slate-900 italic tracking-tighter">{stat.value}</h4>
                  <p className="text-[7px] sm:text-[8px] font-black text-neutral-muted uppercase tracking-widest">{stat.label}</p>
                </Card>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex items-center bg-white shadow-xl shadow-primary/5 border border-primary/10 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl overflow-x-auto no-scrollbar w-full sm:w-auto">
                {(['all', 'issues', 'reported', 'flagged', 'banned', 'with_tickets'] as const).map((cat) => (
                  <button
                    key={`member-category-filter-${cat}`}
                    onClick={() => setCategoryFilter(cat)}
                    className={cn(
                      "px-4 py-2 sm:px-6 sm:py-3 text-[8px] sm:text-[10px] font-black uppercase tracking-[0.1em] sm:tracking-[0.15em] rounded-lg sm:rounded-xl transition-all duration-300 whitespace-nowrap",
                      categoryFilter === cat 
                        ? "bg-primary text-white shadow-lg shadow-primary/20" 
                        : "text-neutral-muted hover:text-primary hover:bg-primary/5"
                    )}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-auto">
                <button 
                  onClick={() => setIsUserFilterOpen(!isUserFilterOpen)}
                  className={cn(
                    "w-full sm:w-auto flex items-center justify-center gap-2 sm:gap-3 px-5 py-3 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl border border-primary/10 bg-white shadow-xl shadow-primary/5 transition-all hover:bg-primary/5",
                    statusFilter !== 'all' && "ring-2 ring-primary/20 border-primary/30"
                  )}
                >
                  <Icon name="filter_list" className={cn("text-base sm:text-lg", statusFilter !== 'all' ? "text-primary" : "text-neutral-muted")} />
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] text-neutral-muted">
                    {statusFilter === 'all' ? 'Status Filter' : statusFilter.replace('_', ' ')}
                  </span>
                  <Icon name={isUserFilterOpen ? "expand_less" : "expand_more"} className="text-xs sm:text-sm text-neutral-muted" />
                </button>

                <AnimatePresence>
                  {isUserFilterOpen && (
                    <>
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsUserFilterOpen(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-full mt-3 w-56 bg-white rounded-[2rem] shadow-2xl border border-slate-200 p-2 z-50 overflow-hidden"
                      >
                        {(['all', 'online', 'in_app', 'inactive'] as const).map((f) => (
                          <button
                            key={`member-status-filter-btn-${f}`}
                            onClick={() => {
                              setStatusFilter(f);
                              setIsUserFilterOpen(false);
                            }}
                            className={cn(
                              "w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                              statusFilter === f ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-neutral-muted hover:bg-primary/5 hover:text-primary"
                            )}
                          >
                            <Icon name={
                              f === 'all' ? 'group' : 
                              f === 'online' ? 'online_prediction' : 
                              f === 'in_app' ? 'bolt' : 'person_off'
                            } className="text-lg" />
                            {f.replace('_', ' ')}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <Card className="bg-white shadow-2xl shadow-primary/5 border-none rounded-[2rem] sm:rounded-[3rem] overflow-hidden">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-primary text-white">
                      <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em]">Member Profile</th>
                      <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em]">Protocol Status</th>
                      <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em]">Network Activity</th>
                      <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em] text-right">Command</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/5">
                    {users
                      .filter(u => u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || u.username.toLowerCase().includes(searchQuery.toLowerCase()))
                      .filter(u => {
                        if (statusFilter === 'all') return true;
                        if (statusFilter === 'online') return u.isOnline;
                        if (statusFilter === 'in_app') return u.isInApp;
                        if (statusFilter === 'inactive') return isUserInactive(u.lastSeen);
                        return true;
                      })
                      .filter(u => {
                        if (categoryFilter === 'all') return true;
                        if (categoryFilter === 'issues') return u.isReported || u.isAdminFlagged || u.isBanned;
                        if (categoryFilter === 'reported') return u.isReported;
                        if (categoryFilter === 'flagged') return u.isAdminFlagged;
                        if (categoryFilter === 'banned') return u.isBanned;
                        if (categoryFilter === 'with_tickets') return tickets.some(t => t.userId === u.id);
                        return true;
                      })
                      .map((u) => {
                        const status = getUserStatus(u);
                        return (
                          <motion.tr 
                            key={`desktop-user-row-${u.id}`} 
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="group hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-5">
                                <Avatar src={u.avatar} className="size-14 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-500" />
                                <div>
                                  <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{u.displayName}</p>
                                  <p className="text-[9px] font-black text-neutral-muted uppercase tracking-widest mt-1">@{u.username}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-3">
                                <div className={cn("size-2.5 rounded-full shadow-sm", 
                                  status.color === 'emerald' ? "bg-emerald-500 shadow-emerald-500/20" :
                                  status.color === 'blue' ? "bg-blue-500 shadow-blue-500/20" :
                                  status.color === 'red' ? "bg-red-500 shadow-red-500/20" :
                                  "bg-primary/20 shadow-primary/10"
                                )} />
                                <span className={cn("text-[10px] font-black uppercase tracking-widest", 
                                  status.color === 'emerald' ? "text-emerald-600" :
                                  status.color === 'blue' ? "text-blue-600" :
                                  status.color === 'red' ? "text-red-600" :
                                  "text-neutral-muted"
                                )}>
                                  {status.label}
                                </span>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <Icon name="history" className="text-[10px] text-primary/30" />
                                  <span className="text-[9px] font-black text-neutral-muted uppercase tracking-widest">Seen: {getOfflineDuration(u.lastSeen)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Icon name="calendar_today" className="text-[10px] text-primary/30" />
                                  <span className="text-[9px] font-black text-neutral-muted uppercase tracking-widest">Joined: {u.joinDate || '2024-01-01'}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6 text-right">
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                                <button 
                                  onClick={() => setFlaggingUser(u)} 
                                  className={cn(
                                    "size-10 rounded-xl bg-white shadow-lg border flex items-center justify-center transition-all",
                                    u.isAdminFlagged 
                                      ? "text-amber-500 border-amber-200 bg-amber-50" 
                                      : "text-neutral-muted border-primary/5 hover:text-amber-500 hover:border-amber-200"
                                  )}
                                >
                                  <Icon name="flag" className="text-lg" />
                                </button>
                                <button onClick={() => banUser(u.id)} className={cn(
                                  "size-10 rounded-xl bg-white shadow-lg border border-primary/5 flex items-center justify-center transition-all",
                                  u.isBanned ? "text-emerald-500 hover:text-emerald-600 hover:border-emerald-200" : "text-neutral-muted hover:text-red-500 hover:border-red-200"
                                )}>
                                  <Icon name={u.isBanned ? "check_circle" : "block"} className="text-lg" />
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-primary/5">
                {users
                  .filter(u => u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || u.username.toLowerCase().includes(searchQuery.toLowerCase()))
                  .filter(u => {
                    if (statusFilter === 'all') return true;
                    if (statusFilter === 'online') return u.isOnline;
                    if (statusFilter === 'in_app') return u.isInApp;
                    if (statusFilter === 'inactive') return isUserInactive(u.lastSeen);
                    return true;
                  })
                  .filter(u => {
                    if (categoryFilter === 'all') return true;
                    if (categoryFilter === 'issues') return u.isReported || u.isAdminFlagged || u.isBanned;
                    if (categoryFilter === 'reported') return u.isReported;
                    if (categoryFilter === 'flagged') return u.isAdminFlagged;
                    if (categoryFilter === 'banned') return u.isBanned;
                    if (categoryFilter === 'with_tickets') return tickets.some(t => t.userId === u.id);
                    return true;
                  })
                  .map((u) => {
                    const status = getUserStatus(u);
                    return (
                      <div key={`mobile-user-card-${u.id}`} className="p-4 sm:p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 sm:gap-4">
                            <Avatar src={u.avatar} className="size-10 sm:size-12 rounded-xl shadow-md" />
                            <div className="min-w-0">
                              <p className="text-[10px] sm:text-[11px] font-black text-slate-900 uppercase tracking-tight truncate max-w-[120px] sm:max-w-none">{u.displayName}</p>
                              <p className="text-[8px] sm:text-[9px] font-black text-neutral-muted uppercase tracking-widest mt-0.5 truncate">@{u.username}</p>
                            </div>
                          </div>
                          <div className={cn("px-2.5 py-1 rounded-full text-[7px] sm:text-[8px] font-black uppercase tracking-widest border shrink-0", 
                            status.color === 'emerald' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                            status.color === 'blue' ? "bg-blue-50 text-blue-600 border-blue-100" :
                            status.color === 'red' ? "bg-red-50 text-red-600 border-red-100" :
                            "bg-primary/5 text-neutral-muted border-primary/10"
                          )}>
                            {status.label}
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-primary/5">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Icon name="history" className="text-[9px] sm:text-[10px] text-primary/30" />
                              <span className="text-[7px] sm:text-[8px] font-black text-neutral-muted uppercase tracking-widest">Seen: {getOfflineDuration(u.lastSeen)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => setFlaggingUser(u)} 
                              className={cn(
                                "size-9 sm:size-10 rounded-lg sm:rounded-xl flex items-center justify-center active:scale-95 transition-transform",
                                u.isAdminFlagged 
                                  ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20" 
                                  : "bg-primary/5 text-amber-500"
                              )}
                            >
                              <Icon name="flag" className="text-base sm:text-lg" />
                            </button>
                            <button onClick={() => banUser(u.id)} className={cn(
                              "size-9 sm:size-10 rounded-lg sm:rounded-xl flex items-center justify-center active:scale-95 transition-transform",
                              u.isBanned ? "bg-emerald-50 text-emerald-500" : "bg-red-50 text-red-500"
                            )}>
                              <Icon name={u.isBanned ? "check_circle" : "block"} className="text-base sm:text-lg" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </Card>
          </motion.div>
        )}

        {activeTab === 'users' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-10"
          >
            <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 items-start lg:items-end justify-between">
              <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="size-10 sm:size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Icon name="admin_panel_settings" className="text-xl sm:text-2xl" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 uppercase italic tracking-tighter">Team Member Working Section</h3>
                </div>
                <p className="text-[9px] sm:text-[11px] font-black text-neutral-muted uppercase tracking-[0.3em] sm:tracking-[0.4em] pl-1">Internal team, administrators & system operators</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                <div className="relative flex-1 sm:w-80 group">
                  <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-muted group-focus-within:text-primary transition-colors" />
                  <input 
                    type="text"
                    placeholder="SEARCH TEAM..."
                    value={teamSearchQuery}
                    onChange={(e) => setTeamSearchQuery(e.target.value)}
                    className="w-full bg-white border border-primary/10 rounded-2xl pl-12 pr-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] outline-none focus:ring-4 ring-primary/10 transition-all shadow-xl shadow-primary/5"
                  />
                </div>
                <Button onClick={handleAddClick} className="h-14 px-8 bg-primary text-white hover:bg-primary-dark shadow-2xl shadow-primary/20 rounded-2xl border-none text-[10px] font-black uppercase tracking-widest">
                  <Icon name="add_moderator" className="text-xl" />
                  Add Member
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex items-center bg-white shadow-xl shadow-primary/5 border border-primary/10 p-1.5 rounded-2xl overflow-x-auto no-scrollbar w-full sm:w-auto">
                {(['all', 'admins', 'removed', ...TEAM_ROLES.map(t => t.id)] as const).map((cat) => (
                  <button
                    key={`team-filter-${cat}`}
                    onClick={() => setTeamCategoryFilter(cat)}
                    className={cn(
                      "px-6 py-3 text-[10px] font-black uppercase tracking-[0.15em] rounded-xl transition-all duration-300 whitespace-nowrap",
                      teamCategoryFilter === cat 
                        ? "bg-primary text-white shadow-lg shadow-primary/20" 
                        : "text-neutral-muted hover:text-primary hover:bg-primary/5"
                    )}
                  >
                    {cat === 'all' ? 'Full Team' : cat === 'admins' ? 'Admins' : cat === 'removed' ? 'Removed' : TEAM_ROLES.find(t => t.id === cat)?.label}
                  </button>
                ))}
              </div>
            </div>

            <Card className="bg-white shadow-2xl shadow-primary/5 border-none rounded-[2rem] sm:rounded-[3rem] overflow-hidden">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-primary text-white">
                      <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em]">Operator</th>
                      <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em]">Access Level</th>
                      <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em]">Status</th>
                      <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em] text-right">Command</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/5">
                    {teamMembers
                      .filter(m => m.displayName.toLowerCase().includes(teamSearchQuery.toLowerCase()) || m.username.toLowerCase().includes(teamSearchQuery.toLowerCase()))
                      .filter(m => {
                        if (teamCategoryFilter === 'all') return true;
                        if (teamCategoryFilter === 'admins') return m.isAdmin;
                        if (teamCategoryFilter === 'removed') return m.isBanned;
                        return m.teamRole === teamCategoryFilter;
                      })
                      .map((member) => (
                        <motion.tr 
                          key={`desktop-team-row-${member.id}`} 
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="group hover:bg-primary/5 transition-colors"
                        >
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-5">
                              <Avatar src={member.avatar} className="size-14 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-500" />
                              <div>
                                <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{member.displayName}</p>
                                <p className="text-[9px] font-black text-neutral-muted uppercase tracking-widest mt-1">@{member.username}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <div className="flex flex-wrap gap-2 max-w-xs">
                              {member.isAdmin ? (
                                <span className="px-3 py-1 bg-primary/10 text-primary text-[8px] font-black uppercase tracking-[0.2em] rounded-lg border border-primary/20">Full Access</span>
                              ) : (
                                <>
                                  {member.teamRole && (
                                    <span className="px-3 py-1 bg-amber-500/10 text-amber-600 text-[8px] font-black uppercase tracking-[0.2em] rounded-lg border border-amber-500/20">
                                      {TEAM_ROLES.find(r => r.id === member.teamRole)?.label || member.teamRole}
                                    </span>
                                  )}
                                  {member.allowedTabs?.map((tab, tabIdx) => (
                                    <span key={`team-access-tab-${member.id}-${tab}-${tabIdx}`} className="px-3 py-1 bg-primary/5 text-primary text-[8px] font-black uppercase tracking-[0.2em] rounded-lg border border-primary/10">{ADMIN_TABS.find(t => t.id === tab)?.label || tab.replace('_', ' ')}</span>
                                  ))}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-3">
                              <div className={cn("size-2.5 rounded-full shadow-sm", 
                                member.isBanned ? "bg-red-500 shadow-red-500/20" : "bg-emerald-500 shadow-emerald-500/20"
                              )} />
                              <span className={cn("text-[10px] font-black uppercase tracking-widest", 
                                member.isBanned ? "text-red-600" : "text-emerald-600"
                              )}>
                                {member.isBanned ? 'Access Revoked' : 'Active Duty'}
                              </span>
                            </div>
                          </td>
                          <td className="px-8 py-6 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                              <button onClick={() => handleEditClick(member)} className="size-10 rounded-xl bg-white shadow-lg border border-primary/5 flex items-center justify-center text-neutral-muted hover:text-primary hover:border-primary/30 transition-all">
                                <Icon name="edit" className="text-lg" />
                              </button>
                              <button onClick={() => banUser(member.id)} className={cn(
                                "size-10 rounded-xl bg-white shadow-lg border border-primary/5 flex items-center justify-center transition-all",
                                member.isBanned ? "text-emerald-500 hover:text-emerald-600 hover:border-emerald-200" : "text-neutral-muted hover:text-red-500 hover:border-red-200"
                              )}>
                                <Icon name={member.isBanned ? "restore" : "person_remove"} className="text-lg" />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-primary/5">
                {teamMembers
                  .filter(m => m.displayName.toLowerCase().includes(teamSearchQuery.toLowerCase()) || m.username.toLowerCase().includes(teamSearchQuery.toLowerCase()))
                  .filter(m => {
                    if (teamCategoryFilter === 'all') return true;
                    if (teamCategoryFilter === 'admins') return m.isAdmin;
                    if (teamCategoryFilter === 'removed') return m.isBanned;
                    return m.teamRole === teamCategoryFilter;
                  })
                  .map((member) => (
                    <div key={`mobile-team-${member.id}`} className="p-4 sm:p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 sm:gap-4">
                          <Avatar src={member.avatar} className="size-10 sm:size-12 rounded-xl shadow-md" />
                          <div className="min-w-0">
                            <p className="text-[10px] sm:text-[11px] font-black text-slate-900 uppercase tracking-tight truncate max-w-[120px] sm:max-w-none">{member.displayName}</p>
                            <p className="text-[8px] sm:text-[9px] font-black text-neutral-muted uppercase tracking-widest mt-0.5 truncate">@{member.username}</p>
                          </div>
                        </div>
                        <div className={cn("px-2.5 py-1 rounded-full text-[7px] sm:text-[8px] font-black uppercase tracking-widest border shrink-0", 
                          member.isBanned ? "bg-red-50 text-red-600 border-red-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                        )}>
                          {member.isBanned ? 'Revoked' : 'Active'}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {member.isAdmin ? (
                          <span className="px-2 py-0.5 bg-primary/5 text-primary text-[7px] font-black uppercase tracking-widest rounded-full border border-primary/10">Full Access</span>
                        ) : (
                          <>
                            {member.teamRole && (
                              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 text-[7px] font-black uppercase tracking-widest rounded-full border border-amber-500/20">
                                {TEAM_ROLES.find(r => r.id === member.teamRole)?.label || member.teamRole}
                              </span>
                            )}
                            {member.allowedTabs?.map(tab => (
                              <span key={`mobile-tab-${member.id}-${tab}`} className="px-2 py-0.5 bg-primary/5 text-primary text-[7px] font-black uppercase tracking-widest rounded-full border border-primary/10">
                                {ADMIN_TABS.find(t => t.id === tab)?.label || tab.replace('_', ' ')}
                              </span>
                            ))}
                          </>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-3 border-t border-primary/5">
                        <button onClick={() => handleEditClick(member)} className="size-9 sm:size-10 rounded-lg sm:rounded-xl bg-primary/5 flex items-center justify-center text-primary active:scale-95 transition-transform">
                          <Icon name="edit" className="text-base sm:text-lg" />
                        </button>
                        <button onClick={() => banUser(member.id)} className={cn(
                          "size-9 sm:size-10 rounded-lg sm:rounded-xl flex items-center justify-center active:scale-95 transition-transform",
                          member.isBanned ? "bg-emerald-50 text-emerald-500" : "bg-red-50 text-red-500"
                        )}>
                          <Icon name={member.isBanned ? "restore" : "person_remove"} className="text-base sm:text-lg" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          </motion.div>
        )}

        {activeTab === 'broadcast' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-10"
          >
            <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 items-start lg:items-end justify-between">
              <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="size-10 sm:size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Icon name="campaign" className="text-xl sm:text-2xl" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 uppercase italic tracking-tighter">Global Broadcast</h3>
                </div>
                <p className="text-[9px] sm:text-[11px] font-black text-neutral-muted uppercase tracking-[0.3em] sm:tracking-[0.4em] pl-1">Protocol-wide announcements & emergency alerts</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 sm:gap-10">
              <div className="xl:col-span-3 space-y-6 sm:space-y-10">
                <Card className="p-6 sm:p-10 space-y-6 sm:space-y-10 bg-white shadow-2xl shadow-primary/5 border-none rounded-[2rem] sm:rounded-[3rem]">
                  <div className="space-y-6 sm:space-y-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                      <div className="space-y-3 sm:space-y-4">
                        <label className="text-[9px] sm:text-[10px] font-black text-neutral-muted uppercase tracking-[0.3em] pl-1">Target Audience</label>
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          {(['all', 'admins', 'members', 'users'] as const).map((aud) => (
                            <button
                              key={`broadcast-audience-${aud}`}
                              onClick={() => setBroadcastAudience(aud)}
                              className={cn(
                                "px-3 py-3 sm:px-4 sm:py-4 rounded-xl sm:rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all border-2",
                                broadcastAudience === aud 
                                  ? "bg-primary border-primary text-white shadow-xl shadow-primary/20" 
                                  : "bg-primary/5 border-transparent text-neutral-muted hover:border-primary/20"
                              )}
                            >
                              {aud}
                            </button>
                          ))}
                        </div>
                        {(broadcastAudience === 'users' || broadcastAudience === 'members') && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-4 p-4 bg-primary/5 rounded-2xl border border-primary/10 space-y-3"
                          >
                            <label className="text-[8px] font-black text-neutral-muted uppercase tracking-widest">Select Recipients</label>
                            <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                              {users
                                .filter(u => {
                                  if (broadcastAudience === 'members') return u.isAdmin || u.allowedTabs?.length || u.teamRole;
                                  if (broadcastAudience === 'users') return !(u.isAdmin || u.allowedTabs?.length || u.teamRole);
                                  if (broadcastAudience === 'admins') return u.isAdmin;
                                  return true;
                                })
                                .map(u => (
                                <button
                                  key={`broadcast-select-user-${u.id}`}
                                  onClick={() => {
                                    setBroadcastSelectedUsers(prev => 
                                      prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]
                                    );
                                  }}
                                  className={cn(
                                    "flex flex-col items-center gap-2 min-w-[64px] p-2 rounded-2xl transition-all border-2",
                                    broadcastSelectedUsers.includes(u.id) ? "bg-primary/10 border-primary shadow-lg shadow-primary/20" : "bg-white border-transparent hover:border-primary/20"
                                  )}
                                >
                                  <div className="relative">
                                    <Avatar src={u.avatar} className="size-10 rounded-xl shadow-sm" />
                                    {broadcastSelectedUsers.includes(u.id) && (
                                      <div className="absolute -top-1 -right-1 size-4 bg-primary text-white rounded-full flex items-center justify-center shadow-md border border-white">
                                        <Icon name="check" className="text-[8px]" />
                                      </div>
                                    )}
                                  </div>
                                  <span className="text-[7px] font-black uppercase text-slate-900 text-center line-clamp-1 w-full">{u.displayName}</span>
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </div>
                      <div className="space-y-3 sm:space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] sm:text-[10px] font-black text-neutral-muted uppercase tracking-[0.3em] pl-1">Message Type</label>
                          <button 
                            onClick={() => setShowTemplateModal(true)}
                            className="text-[8px] font-black text-primary uppercase tracking-widest hover:underline"
                          >
                            Use Template
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          {(['info', 'warning', 'error', 'success', 'announcement', 'maintenance', 'security'] as const).map((type) => (
                            <button
                              key={`broadcast-type-${type}`}
                              onClick={() => setBroadcastType(type)}
                              className={cn(
                                "px-3 py-3 sm:px-4 sm:py-4 rounded-xl sm:rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all border-2",
                                broadcastType === type 
                                  ? "bg-primary border-primary text-white shadow-xl shadow-primary/20" 
                                  : "bg-primary/5 border-transparent text-neutral-muted hover:border-primary/20"
                              )}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 sm:space-y-4">
                      <label className="text-[9px] sm:text-[10px] font-black text-neutral-muted uppercase tracking-[0.3em] pl-1">Announcement Content</label>
                      <textarea 
                        placeholder="TYPE YOUR MESSAGE HERE..."
                        value={broadcastMsg}
                        onChange={(e) => setBroadcastMsg(e.target.value)}
                        className="w-full h-32 sm:h-48 bg-primary/5 border-2 border-transparent rounded-[1.5rem] sm:rounded-[2rem] p-6 sm:p-8 text-[10px] sm:text-[11px] font-bold text-slate-900 uppercase tracking-wide outline-none focus:border-primary/30 focus:bg-white transition-all resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                      <div className="space-y-3 sm:space-y-4">
                        <label className="text-[9px] sm:text-[10px] font-black text-neutral-muted uppercase tracking-[0.3em] pl-1">Action Link (Optional)</label>
                        <input 
                          type="text"
                          placeholder="HTTPS://..."
                          value={broadcastActionLink}
                          onChange={(e) => setBroadcastActionLink(e.target.value)}
                          className="w-full bg-primary/5 border-2 border-transparent rounded-xl sm:rounded-2xl px-5 py-3 sm:px-6 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest outline-none focus:border-primary/30 focus:bg-white transition-all"
                        />
                      </div>
                      <div className="space-y-3 sm:space-y-4">
                        <label className="text-[9px] sm:text-[10px] font-black text-neutral-muted uppercase tracking-[0.3em] pl-1">Schedule Delivery</label>
                        <input 
                          type="datetime-local"
                          value={broadcastScheduleDate}
                          onChange={(e) => {
                            setBroadcastScheduleDate(e.target.value);
                            setBroadcastSchedule(!!e.target.value);
                          }}
                          className="w-full bg-primary/5 border-2 border-transparent rounded-xl sm:rounded-2xl px-5 py-3 sm:px-6 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest outline-none focus:border-primary/30 focus:bg-white transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 p-5 sm:p-6 bg-primary/5 rounded-[1.5rem] sm:rounded-3xl">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setBroadcastPersistence(broadcastPersistence === 'persistent' ? 'temporary' : 'persistent')}
                          className={cn(
                            "size-6 rounded-lg border-2 transition-all flex items-center justify-center",
                            broadcastPersistence === 'persistent' ? "bg-primary border-primary text-white" : "border-primary/20 bg-white"
                          )}
                        >
                          {broadcastPersistence === 'persistent' && <Icon name="check" className="text-sm" />}
                        </button>
                        <span className="text-[10px] font-black text-neutral-muted uppercase tracking-widest">Persistent Message</span>
                      </div>
                      <div className="hidden sm:block size-1 rounded-full bg-primary/20" />
                      <p className="text-[8px] sm:text-[9px] font-bold text-neutral-muted uppercase tracking-widest italic">Persistent messages stay visible until dismissed by user.</p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <Button 
                      onClick={() => setPreviewTemplate({ name: 'Current Broadcast', content: broadcastMsg })}
                      disabled={!broadcastMsg.trim()}
                      className="h-16 sm:h-20 px-8 sm:px-10 bg-primary/5 text-primary hover:bg-primary/10 border-none shadow-none rounded-[1.2rem] sm:rounded-[1.5rem]"
                    >
                      <Icon name="visibility" className="text-xl sm:text-2xl" />
                    </Button>
                    <Button 
                      onClick={handleSendBroadcast}
                      className="flex-1 h-16 sm:h-20 bg-primary text-white hover:bg-primary-dark shadow-2xl shadow-primary/20 rounded-[1.2rem] sm:rounded-[1.5rem] text-[10px] sm:text-[12px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] transition-all duration-500 border-none"
                    >
                      <Icon name="send" className="text-xl sm:text-2xl" />
                      Execute Broadcast
                    </Button>
                    <Button className="h-16 sm:h-20 px-8 sm:px-10 bg-primary/5 text-primary hover:bg-primary/10 border-none shadow-none rounded-[1.2rem] sm:rounded-[1.5rem]">
                      <Icon name="save" className="text-xl sm:text-2xl" />
                    </Button>
                  </div>
                </Card>
              </div>

              <div className="xl:col-span-2 space-y-6 sm:space-y-10">
                <Card className="p-6 sm:p-10 space-y-6 sm:space-y-8 bg-white shadow-2xl shadow-primary/5 border-none rounded-[2rem] sm:rounded-[3rem]">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-slate-900 uppercase italic tracking-tight text-lg sm:text-xl">Transmission History</h3>
                    <div className="size-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                      <Icon name="history" />
                    </div>
                  </div>
                  <div className="space-y-4 sm:space-y-6">
                    {broadcasts.map((h) => (
                      <div key={`broadcast-history-item-${h.id}`} className="group relative p-4 sm:p-6 bg-primary/5 hover:bg-primary/10 rounded-2xl sm:rounded-3xl transition-all duration-500">
                        <div className="flex items-start justify-between mb-3 sm:mb-4">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className={cn("size-2 rounded-full", 
                              h.type === 'info' ? "bg-blue-500" :
                              h.type === 'warning' ? "bg-amber-500" :
                              h.type === 'error' ? "bg-red-500" : "bg-emerald-500"
                            )} />
                            <span className="text-[7px] sm:text-[9px] font-black text-slate-900 uppercase tracking-[0.15em] sm:tracking-[0.2em]">{h.type}</span>
                          </div>
                          <span className="text-[7px] sm:text-[8px] font-black text-neutral-muted uppercase tracking-widest">{h.timestamp}</span>
                        </div>
                        <p className="text-[9px] sm:text-[10px] font-bold text-neutral-muted uppercase tracking-wide line-clamp-2 mb-3 sm:mb-4 italic">"{h.message}"</p>
                        <div className="flex items-center justify-between pt-3 sm:pt-4 border-t border-primary/10">
                          <div className="flex gap-3 sm:gap-4">
                            <div className="flex flex-col">
                              <span className="text-[7px] sm:text-[8px] font-black text-neutral-muted uppercase tracking-widest">Reach</span>
                              <span className="text-[9px] sm:text-[11px] font-black text-slate-900 italic tracking-tighter">{h.reach}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[7px] sm:text-[8px] font-black text-neutral-muted uppercase tracking-widest">CTR</span>
                              <span className="text-[9px] sm:text-[11px] font-black text-slate-900 italic tracking-tighter">{h.clickRate}%</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button className="size-7 sm:size-8 rounded-lg bg-white shadow-sm border border-primary/5 flex items-center justify-center text-neutral-muted hover:text-primary active:scale-95 transition-transform">
                              <Icon name="content_copy" className="text-xs sm:text-sm" />
                            </button>
                            <button onClick={() => deleteBroadcast(h.id)} className="size-7 sm:size-8 rounded-lg bg-white shadow-sm border border-primary/5 flex items-center justify-center text-neutral-muted hover:text-red-500 active:scale-95 transition-transform">
                              <Icon name="delete" className="text-xs sm:text-sm" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button className="w-full bg-primary/5 text-primary hover:bg-primary hover:text-white border-none shadow-none text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] h-14 sm:h-16 rounded-xl sm:rounded-2xl transition-all duration-500">
                    Full Archive
                  </Button>
                </Card>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'integrations' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-10"
          >
              <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 items-start lg:items-end justify-between">
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="size-10 sm:size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <Icon name="hub" className="text-xl sm:text-2xl" />
                    </div>
                    <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 uppercase italic tracking-tighter">Integrations</h3>
                  </div>
                  <p className="text-[9px] sm:text-[11px] font-black text-neutral-muted uppercase tracking-[0.3em] sm:tracking-[0.4em] pl-1">External services & API infrastructure</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                  <Button 
                    onClick={() => setIsCreatingWebhook(true)}
                    className="h-14 px-8 bg-primary/5 text-primary hover:bg-primary/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-none"
                  >
                    <Icon name="webhook" className="mr-2" />
                    Create Webhook
                  </Button>
                  <Button 
                    onClick={() => setIsCreatingService(true)}
                    className="h-14 px-8 bg-primary text-white hover:bg-primary-dark rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-none shadow-2xl shadow-primary/20"
                  >
                    <Icon name="add" className="mr-2" />
                    Connect New Service
                  </Button>
                </div>
              </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {[
                { name: 'Firebase Cloud', status: 'Operational', latency: '24ms', icon: 'cloud', color: 'bg-amber-500', usage: 45 },
                { name: 'Gemini AI Engine', status: 'Operational', latency: '142ms', icon: 'psychology', color: 'bg-primary', usage: 78 },
                { name: 'Stripe Gateway', status: 'Operational', latency: '89ms', icon: 'payments', color: 'bg-indigo-500', usage: 12 },
                { name: 'SendGrid SMTP', status: 'Operational', latency: '15ms', icon: 'mail', color: 'bg-blue-500', usage: 34 },
                { name: 'Twilio SMS', status: 'Degraded', latency: '450ms', icon: 'sms', color: 'bg-red-500', usage: 56 },
              ].map((service) => (
                <Card key={`integration-service-${service.name}`} className="p-5 sm:p-8 space-y-4 sm:space-y-6 bg-white shadow-xl shadow-primary/5 border-none rounded-2xl sm:rounded-[2.5rem] group hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500">
                  <div className="flex items-start justify-between">
                    <div className={cn("size-10 sm:size-14 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg", service.color)}>
                      <Icon name={service.icon} className="text-xl sm:text-2xl" />
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 sm:gap-2 justify-end">
                        <div className={cn("size-1.5 sm:size-2 rounded-full animate-pulse", service.status === 'Operational' ? 'bg-emerald-500' : 'bg-red-500')} />
                        <span className="text-[7px] sm:text-[9px] font-black text-slate-900 uppercase tracking-widest">{service.status}</span>
                      </div>
                      <span className="text-[8px] sm:text-[10px] font-bold text-neutral-muted uppercase tracking-widest italic">{service.latency}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm sm:text-lg font-black text-slate-900 uppercase italic tracking-tight">{service.name}</h4>
                    <div className="flex items-center justify-between">
                      <span className="text-[7px] sm:text-[9px] font-black text-neutral-muted uppercase tracking-widest">API Usage Quota</span>
                      <span className="text-[8px] sm:text-[10px] font-black text-slate-900 italic tracking-tighter">{service.usage}%</span>
                    </div>
                    <div className="h-1.5 sm:h-2 w-full bg-primary/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${service.usage}%` }}
                        transition={{ duration: 1, delay: 0.5 }}
                        className={cn("h-full rounded-full", service.usage > 80 ? 'bg-red-500' : service.color)} 
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 sm:gap-3 pt-1 sm:pt-2">
                    <button 
                      onClick={async () => {
                        try {
                          const response = await fetch(`${BACKEND_URL}/api/integrations/connect`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ service: service.name })
                          });
                          const data = await response.json();
                          if (data.success) {
                            setShowSuccessMessage(data.message);
                          } else {
                            setShowSuccessMessage(`Error: ${data.message}`);
                          }
                        } catch (error) {
                          setShowSuccessMessage('Failed to connect to integration service.');
                        }
                      }}
                      className="flex-1 h-10 sm:h-12 bg-primary/5 hover:bg-primary/10 rounded-lg sm:rounded-xl text-[7px] sm:text-[9px] font-black text-primary uppercase tracking-widest transition-all active:scale-95"
                    >
                      Configure
                    </button>
                    <button className="size-10 sm:size-12 bg-primary/5 hover:bg-primary/10 rounded-lg sm:rounded-xl flex items-center justify-center text-primary transition-all active:scale-95">
                      <Icon name="settings" className="text-lg" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>

            <Card className="p-6 sm:p-10 bg-primary text-white rounded-2xl sm:rounded-[3rem] border-none shadow-2xl shadow-primary/20 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-6 sm:p-12 opacity-10">
                <Icon name="api" className="text-[6rem] sm:text-[12rem]" />
              </div>
              <div className="relative z-10 space-y-6 sm:space-y-8 max-w-2xl">
                <div className="space-y-2">
                  <h3 className="text-xl sm:text-3xl font-black uppercase italic tracking-tighter">System Webhooks</h3>
                  <p className="text-white/60 text-[8px] sm:text-[11px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em]">Real-time event synchronization across your infrastructure</p>
                </div>
                <div className="space-y-3 sm:space-y-4">
                  {[
                    { event: 'user.created', url: 'https://api.internal.io/hooks/v1/users', active: true },
                    { event: 'payment.success', url: 'https://webhooks.stripe.com/v2/payments', active: true },
                    { event: 'system.alert', url: 'https://discord.com/api/webhooks/...', active: false },
                  ].map((hook) => (
                    <div key={`webhook-item-${hook.event}`} className="flex items-center justify-between p-4 sm:p-6 bg-white/5 rounded-xl sm:rounded-2xl border border-white/10 hover:bg-white/10 transition-all">
                      <div className="space-y-1 min-w-0">
                        <span className="text-[8px] sm:text-[10px] font-black text-white uppercase tracking-widest">{hook.event}</span>
                        <p className="text-[9px] sm:text-[11px] font-mono text-white/60 truncate max-w-[120px] sm:max-w-md">{hook.url}</p>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4">
                        <div className={cn("px-2 py-0.5 sm:px-3 sm:py-1 rounded-lg text-[6px] sm:text-[8px] font-black uppercase tracking-widest", hook.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/40')}>
                          {hook.active ? 'Active' : 'Paused'}
                        </div>
                        <button className="size-8 sm:size-10 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/20 flex items-center justify-center transition-all active:scale-95">
                          <Icon name="more_vert" className="text-sm sm:text-base" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button className="w-full sm:w-auto bg-white text-slate-900 hover:bg-primary hover:text-white h-14 sm:h-16 px-8 sm:px-10 rounded-xl sm:rounded-2xl text-[9px] sm:text-[11px] font-black uppercase tracking-widest transition-all">
                  Create New Webhook
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {activeTab === 'security' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-10"
          >
            <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 items-start lg:items-end justify-between">
              <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="size-10 sm:size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Icon name="security" className="text-xl sm:text-2xl" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 uppercase italic tracking-tighter">Security Settings</h3>
                </div>
                <p className="text-[9px] sm:text-[11px] font-black text-neutral-muted uppercase tracking-[0.3em] sm:tracking-[0.4em] pl-1">System integrity & session monitoring</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
                <Button 
                  onClick={() => {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(realAccessLogs, null, 2));
                    const downloadAnchor = document.createElement('a');
                    downloadAnchor.setAttribute("href", dataStr);
                    downloadAnchor.setAttribute("download", "session_access_logs.json");
                    document.body.appendChild(downloadAnchor);
                    downloadAnchor.click();
                    downloadAnchor.remove();
                  }}
                  className="h-14 px-8 bg-primary/5 text-primary hover:bg-primary/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-none"
                >
                  <Icon name="download" className="mr-2" />
                  Export Session Logs
                </Button>
                <Button className="h-14 px-8 bg-red-500 text-white hover:bg-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-red-500/20 border-none">
                  <Icon name="lock" className="mr-2" />
                  Emergency Lockdown
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 sm:gap-10">
              <div className="xl:col-span-2 space-y-6 sm:space-y-10">
                <Card className="p-6 sm:p-10 space-y-6 sm:space-y-8 bg-white shadow-2xl shadow-primary/5 border-none rounded-[2rem] sm:rounded-[3rem]">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <h3 className="font-black text-slate-900 uppercase italic tracking-tight text-lg sm:text-xl">Access Logs</h3>
                    <div className="relative w-full sm:w-auto">
                      <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-muted" />
                      <input 
                        type="text"
                        placeholder="SEARCH LOGS..."
                        value={securitySearchQuery}
                        onChange={(e) => setSecuritySearchQuery(e.target.value)}
                        className="w-full sm:w-64 bg-primary/5 border-2 border-transparent rounded-xl pl-12 pr-6 py-3 text-[10px] font-black uppercase tracking-widest outline-none focus:border-primary/30 focus:bg-white transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-3 sm:space-y-4">
                    {filteredAccessLogs.slice(0, visibleSecurityLogsCount).map((log, i) => (
                      <div key={`security-log-item-${i}`} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 sm:p-6 rounded-[1.5rem] sm:rounded-3xl border-2 border-primary/5 hover:border-primary/10 hover:bg-primary/5 transition-all group gap-4">
                        <div className="flex items-center gap-4 sm:gap-6">
                          <div className={cn(
                            "size-10 sm:size-12 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm shrink-0",
                            log.status === 'success' ? "bg-emerald-50 text-emerald-500" :
                            log.status === 'failed' ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500"
                          )}>
                            <Icon name={log.status === 'success' ? 'verified' : log.status === 'failed' ? 'error' : 'warning'} className="text-lg sm:text-xl" />
                          </div>
                          <div>
                            <p className="text-[11px] sm:text-[12px] font-black text-slate-900 uppercase italic tracking-tight">{log.event}</p>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
                              <span className="text-[8px] sm:text-[9px] font-black text-neutral-muted uppercase tracking-widest">{log.user}</span>
                              <div className="hidden sm:block size-1 rounded-full bg-primary/20" />
                              <span className="text-[8px] sm:text-[9px] font-black text-neutral-muted uppercase tracking-widest">{log.ip}</span>
                              <div className="hidden sm:block size-1 rounded-full bg-primary/20" />
                              <span className="text-[8px] sm:text-[9px] font-bold text-neutral-muted uppercase tracking-widest italic">{log.location}</span>
                            </div>
                          </div>
                        </div>
                        <div className="w-full sm:w-auto text-left sm:text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center">
                          <span className="text-[9px] sm:text-[10px] font-black text-slate-900 uppercase tracking-widest">{log.time}</span>
                          <button className="text-[8px] font-black text-primary uppercase tracking-widest sm:mt-1 sm:opacity-0 sm:group-hover:opacity-100 transition-all">View Details</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {filteredAccessLogs.length > visibleSecurityLogsCount && (
                    <Button 
                      onClick={() => setVisibleSecurityLogsCount(prev => prev + 5)}
                      className="w-full h-14 sm:h-16 bg-primary/5 text-primary hover:bg-primary hover:text-white rounded-xl sm:rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 border-none shadow-none mt-4"
                    >
                      Load More Logs
                    </Button>
                  )}
                </Card>
              </div>

              <div className="space-y-6 sm:space-y-10">
                <Card className="p-6 sm:p-10 space-y-6 sm:space-y-8 bg-white shadow-2xl shadow-primary/5 border-none rounded-[2rem] sm:rounded-[3rem]">
                  <h3 className="font-black text-slate-900 uppercase italic tracking-tight text-lg sm:text-xl">Security Health</h3>
                  <div className="space-y-6 sm:space-y-8">
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className="size-20 sm:size-24 rounded-full border-[4px] sm:border-[6px] border-emerald-500 flex items-center justify-center relative shrink-0">
                        <div className="absolute inset-0 rounded-full border-[4px] sm:border-[6px] border-emerald-500/20 animate-ping" />
                        <span className="text-xl sm:text-2xl font-black text-emerald-500 italic">LOW</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-neutral-muted uppercase tracking-widest">Threat Level</p>
                        <h4 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">System Secure</h4>
                        <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Last scan: 5m ago</p>
                      </div>
                    </div>

                    <div className="space-y-6 pt-6 border-t border-primary/10">
                      <div className="space-y-3">
                        <div className="flex justify-between items-end">
                          <span className="text-[10px] font-black text-neutral-muted uppercase tracking-widest">Active Accounts</span>
                          <span className="text-2xl font-black text-slate-900 italic tracking-tighter">{users.length + 1}</span>
                        </div>
                        <div className="h-2 w-full bg-primary/10 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: '100%' }}
                            className="h-full bg-primary rounded-full" 
                          />
                        </div>
                        <div className="flex justify-between text-[8px] font-black text-neutral-muted uppercase tracking-widest">
                          <span>100% Secure Nodes</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-10 space-y-8 bg-primary text-white rounded-[3rem] border-none shadow-2xl shadow-primary/20">
                  <h3 className="font-black uppercase italic tracking-tight text-xl">Quick Actions</h3>
                  <div className="space-y-4">
                    {[
                      { label: 'Rotate API Keys', icon: 'key', color: 'bg-amber-500' },
                      { label: 'Clear Cache', icon: 'delete_sweep', color: 'bg-blue-500' },
                      { label: 'Run Full Scan', icon: 'security', color: 'bg-white/20' },
                      { label: 'Manage Permissions', icon: 'rule', color: 'bg-indigo-500' },
                    ].map((action) => (
                      <button key={`quick-action-${action.label}`} className="w-full p-5 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 flex items-center justify-between transition-all group">
                        <div className="flex items-center gap-4">
                          <div className={cn("size-10 rounded-xl flex items-center justify-center text-white", action.color)}>
                            <Icon name={action.icon} className="text-lg" />
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest">{action.label}</span>
                        </div>
                        <Icon name="chevron_right" className="text-white/50 group-hover:translate-x-1 transition-all" />
                      </button>
                    ))}
                  </div>
                </Card>

                <Card className="p-8 bg-amber-50 border-2 border-amber-200 rounded-[2.5rem] space-y-4">
                  <div className="flex items-center gap-3 text-amber-600">
                    <Icon name="report_problem" className="text-2xl" />
                    <h4 className="text-[12px] font-black uppercase tracking-widest">Security Advisory</h4>
                  </div>
                  <p className="text-[10px] font-bold text-amber-900/70 leading-relaxed uppercase italic">
                    3 failed login attempts detected from a known malicious IP range (45.12.x.x). Automatic firewall rules applied.
                  </p>
                  <Button className="w-full bg-amber-600 text-white hover:bg-amber-700 h-12 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                    Review Firewall
                  </Button>
                </Card>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'website' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-10"
          >
            <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 items-start lg:items-end justify-between">
              <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="size-10 sm:size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Icon name="language" className="text-xl sm:text-2xl" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 uppercase italic tracking-tighter">Website Management</h3>
                </div>
                <p className="text-[9px] sm:text-[11px] font-black text-neutral-muted uppercase tracking-[0.3em] sm:tracking-[0.4em] pl-1">Manage website content and settings</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              <Card className="p-6 sm:p-8 space-y-8 bg-white shadow-2xl shadow-primary/5 border-none rounded-[2rem] sm:rounded-[3rem]">
                <div className="flex items-center gap-4 border-b border-primary/10 pb-6">
                  <div className="size-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary">
                    <Icon name="settings_suggest" className="text-2xl" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">General Settings</h4>
                    <p className="text-[10px] font-black text-neutral-muted uppercase tracking-widest">Core website configuration</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10">
                    <div>
                      <h5 className="text-sm font-black text-slate-900">Maintenance Mode</h5>
                      <p className="text-[10px] font-bold text-neutral-muted mt-1">Temporarily disable public access</p>
                    </div>
                    <button 
                      onClick={() => setWebsiteData(prev => ({ ...prev, maintenanceMode: !prev.maintenanceMode }))}
                      className={cn(
                        "w-14 h-8 rounded-full transition-colors relative shadow-inner", 
                        websiteData.maintenanceMode ? "bg-red-500 shadow-red-500/20" : "bg-emerald-500 shadow-emerald-500/20"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 size-6 bg-white rounded-full transition-transform shadow-md", 
                        websiteData.maintenanceMode ? "right-1" : "left-1"
                      )} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-neutral-muted uppercase tracking-widest px-1">Support Email</label>
                    <div className="relative group">
                      <Icon name="mail" className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-muted group-focus-within:text-primary transition-colors" />
                      <input 
                        type="email"
                        value={websiteData.contactEmail}
                        onChange={e => setWebsiteData(prev => ({ ...prev, contactEmail: e.target.value }))}
                        className="w-full bg-primary/5 border-2 border-transparent rounded-2xl pl-12 pr-4 py-4 text-sm font-bold text-slate-900 focus:border-primary/30 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 sm:p-8 space-y-8 bg-white shadow-2xl shadow-primary/5 border-none rounded-[2rem] sm:rounded-[3rem]">
                <div className="flex items-center gap-4 border-b border-primary/10 pb-6">
                  <div className="size-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary">
                    <Icon name="web" className="text-2xl" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">Hero Section</h4>
                    <p className="text-[10px] font-black text-neutral-muted uppercase tracking-widest">Main landing page content</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-neutral-muted uppercase tracking-widest px-1">Headline</label>
                    <input 
                      type="text"
                      value={websiteData.heroTitle}
                      onChange={e => setWebsiteData(prev => ({ ...prev, heroTitle: e.target.value }))}
                      className="w-full bg-primary/5 border-2 border-transparent rounded-2xl px-4 py-4 text-sm font-bold text-slate-900 focus:border-primary/30 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-neutral-muted uppercase tracking-widest px-1">Sub-headline</label>
                    <textarea 
                      value={websiteData.heroSubtitle}
                      onChange={e => setWebsiteData(prev => ({ ...prev, heroSubtitle: e.target.value }))}
                      rows={3}
                      className="w-full bg-primary/5 border-2 border-transparent rounded-2xl px-4 py-4 text-sm font-bold text-slate-900 focus:border-primary/30 outline-none transition-all resize-none"
                    />
                  </div>
                </div>
              </Card>

              <Card className="p-6 sm:p-8 space-y-8 bg-white shadow-2xl shadow-primary/5 border-none rounded-[2rem] sm:rounded-[3rem] lg:col-span-2">
                <div className="flex items-center gap-4 border-b border-primary/10 pb-6">
                  <div className="size-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary">
                    <Icon name="search" className="text-2xl" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">SEO & Metadata</h4>
                    <p className="text-[10px] font-black text-neutral-muted uppercase tracking-widest">Search engine optimization</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-neutral-muted uppercase tracking-widest px-1">Meta Title</label>
                    <input 
                      type="text"
                      value={websiteData.seoTitle}
                      onChange={e => setWebsiteData(prev => ({ ...prev, seoTitle: e.target.value }))}
                      className="w-full bg-primary/5 border-2 border-transparent rounded-2xl px-4 py-4 text-sm font-bold text-slate-900 focus:border-primary/30 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-neutral-muted uppercase tracking-widest px-1">Meta Description</label>
                    <textarea 
                      value={websiteData.seoDescription}
                      onChange={e => setWebsiteData(prev => ({ ...prev, seoDescription: e.target.value }))}
                      rows={3}
                      className="w-full bg-primary/5 border-2 border-transparent rounded-2xl px-4 py-4 text-sm font-bold text-slate-900 focus:border-primary/30 outline-none transition-all resize-none"
                    />
                  </div>
                </div>
                
                <div className="flex justify-end pt-4 border-t border-primary/10">
                  <Button 
                    onClick={() => {
                      setShowSuccessMessage('Website settings updated successfully');
                      setTimeout(() => setShowSuccessMessage(null), 3000);
                    }}
                    className="rounded-2xl px-8 py-4 text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:shadow-primary/40"
                  >
                    Save Changes
                  </Button>
                </div>
              </Card>
            </div>
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-10"
          >
            <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 items-start lg:items-end justify-between">
              <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="size-10 sm:size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Icon name="settings" className="text-xl sm:text-2xl" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 uppercase italic tracking-tighter">System Configuration</h3>
                </div>
                <p className="text-[9px] sm:text-[11px] font-black text-neutral-muted uppercase tracking-[0.3em] sm:tracking-[0.4em] pl-1">Global protocol parameters & feature flags</p>
              </div>
              <Button className="w-full lg:w-auto h-14 px-8 bg-primary text-white hover:bg-primary-dark rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-primary/20 border-none">
                <Icon name="save" className="mr-2" />
                Commit Changes
              </Button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
              <div className="xl:col-span-2 space-y-6 sm:space-y-10">
                <Card className="p-6 sm:p-10 space-y-8 sm:space-y-12 bg-white shadow-2xl shadow-primary/5 border-none rounded-2xl sm:rounded-[3rem]">
                  <div className="space-y-6 sm:space-y-8">
                    <h4 className="text-lg sm:text-xl font-black text-slate-900 uppercase italic tracking-tight">Core Protocol Settings</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                      {[
                        { 
                          id: 'maintenanceMode', 
                          label: 'Maintenance Mode', 
                          desc: 'Restrict access to authorized personnel only',
                          active: systemSettings.maintenanceMode,
                          icon: 'construction'
                        },
                        { 
                          id: 'allowRegistration', 
                          label: 'User Onboarding', 
                          desc: 'Allow new entities to join the protocol',
                          active: systemSettings.allowRegistration,
                          icon: 'person_add'
                        },
                        { 
                          id: 'debugMode', 
                          label: 'Verbose Debugging', 
                          desc: 'Enable detailed system telemetry logs',
                          active: false,
                          icon: 'bug_report'
                        },
                        { 
                          id: 'autoScale', 
                          label: 'Auto-Scaling', 
                          desc: 'Dynamic resource allocation based on load',
                          active: true,
                          icon: 'trending_up'
                        },
                      ].map((setting) => (
                        <div key={`protocol-setting-${setting.id}`} className="flex items-start justify-between p-4 sm:p-6 bg-primary/5 rounded-2xl sm:rounded-3xl group hover:bg-primary/10 transition-all">
                          <div className="flex gap-3 sm:gap-4">
                            <div className="size-8 sm:size-10 rounded-lg sm:rounded-xl bg-white shadow-sm flex items-center justify-center text-neutral-muted group-hover:text-primary transition-all">
                              <Icon name={setting.icon} className="text-sm sm:text-base" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] sm:text-[12px] font-black text-slate-900 uppercase italic tracking-tight">{setting.label}</p>
                              <p className="text-[8px] sm:text-[9px] text-neutral-muted font-bold uppercase tracking-widest leading-relaxed max-w-[140px] sm:max-w-[180px]">{setting.desc}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => {
                              if (setting.id === 'maintenanceMode' || setting.id === 'allowRegistration') {
                                updateSystemSettings({ [setting.id]: !setting.active });
                              }
                            }}
                            className={cn(
                              "w-10 h-5 sm:w-12 sm:h-6 rounded-full transition-all relative mt-1 shrink-0",
                              setting.active ? "bg-primary shadow-lg shadow-primary/20" : "bg-primary/10"
                            )}
                          >
                            <div className={cn(
                              "absolute top-0.5 sm:top-1 size-4 bg-white rounded-full transition-all shadow-sm",
                              setting.active ? "left-5.5 sm:left-7" : "left-0.5 sm:left-1"
                            )} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6 sm:space-y-8 pt-8 sm:pt-10 border-t border-primary/10">
                    <h4 className="text-lg sm:text-xl font-black text-slate-900 uppercase italic tracking-tight">Resource Allocation</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-10">
                      <div className="space-y-4 sm:space-y-6">
                        <div className="flex justify-between items-end">
                          <div className="space-y-1">
                            <p className="text-[8px] sm:text-[10px] font-black text-neutral-muted uppercase tracking-widest">Max Transmission Size</p>
                            <h5 className="text-base sm:text-lg font-black text-slate-900 uppercase italic tracking-tight">File Upload Limit</h5>
                          </div>
                          <span className="text-xl sm:text-2xl font-black text-primary italic tracking-tighter">{systemSettings.maxFileSize}MB</span>
                        </div>
                        <div className="relative h-10 sm:h-12 flex items-center">
                          <div className="absolute inset-0 h-1.5 sm:h-2 bg-primary/10 rounded-full my-auto" />
                          <input 
                            type="range" 
                            min="10" 
                            max="500" 
                            step="10"
                            value={systemSettings.maxFileSize}
                            onChange={(e) => updateSystemSettings({ maxFileSize: parseInt(e.target.value) })}
                            className="w-full h-full appearance-none bg-transparent cursor-pointer accent-primary relative z-10"
                          />
                        </div>
                        <div className="flex justify-between text-[7px] sm:text-[8px] font-black text-neutral-muted uppercase tracking-widest">
                          <span>10MB (MIN)</span>
                          <span>500MB (MAX)</span>
                        </div>
                      </div>

                      <div className="space-y-4 sm:space-y-6">
                        <div className="flex justify-between items-end">
                          <div className="space-y-1">
                            <p className="text-[8px] sm:text-[10px] font-black text-neutral-muted uppercase tracking-widest">Session Expiry</p>
                            <h5 className="text-base sm:text-lg font-black text-slate-900 uppercase italic tracking-tight">Token Duration</h5>
                          </div>
                          <span className="text-xl sm:text-2xl font-black text-primary italic tracking-tighter">24H</span>
                        </div>
                        <div className="relative h-10 sm:h-12 flex items-center">
                          <div className="absolute inset-0 h-1.5 sm:h-2 bg-primary/10 rounded-full my-auto" />
                          <div className="absolute left-0 h-1.5 sm:h-2 bg-primary rounded-full my-auto w-1/2" />
                          <div className="size-3.5 sm:size-4 bg-white border-2 sm:border-4 border-primary rounded-full absolute left-1/2 -translate-x-1/2 shadow-lg" />
                        </div>
                        <div className="flex justify-between text-[7px] sm:text-[8px] font-black text-neutral-muted uppercase tracking-widest">
                          <span>1H</span>
                          <span>168H</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="space-y-6 sm:space-y-10">
                <Card className="p-6 sm:p-10 space-y-6 sm:space-y-8 bg-white shadow-2xl shadow-primary/5 border-none rounded-2xl sm:rounded-[3rem]">
                  <h3 className="font-black text-slate-900 uppercase italic tracking-tight text-lg sm:text-xl">Module Control</h3>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    {[
                      { id: 'social', label: 'Social', icon: 'chat', color: 'bg-emerald-500' },
                      { id: 'fileshare', label: 'Files', icon: 'folder', color: 'bg-blue-500' },
                      { id: 'calls', label: 'Voice', icon: 'call', color: 'bg-primary' },
                      { id: 'discovery', label: 'Explore', icon: 'explore', color: 'bg-orange-500' },
                      { id: 'analytics', label: 'Metrics', icon: 'bar_chart', color: 'bg-indigo-500' },
                      { id: 'groups', label: 'Squads', icon: 'groups', color: 'bg-violet-500' },
                    ].map(feature => (
                      <button 
                        key={`module-control-${feature.id}`}
                        onClick={() => {
                          const newFeatures = systemSettings.activeFeatures.includes(feature.id)
                            ? systemSettings.activeFeatures.filter(f => f !== feature.id)
                            : [...systemSettings.activeFeatures, feature.id];
                          updateSystemSettings({ activeFeatures: newFeatures });
                        }}
                        className={cn(
                          "p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-2 transition-all flex flex-col items-center gap-2 sm:gap-3 group",
                          systemSettings.activeFeatures.includes(feature.id)
                            ? "bg-primary/5 border-primary shadow-lg shadow-primary/10"
                            : "bg-white border-primary/5 hover:border-primary/20"
                        )}
                      >
                        <div className={cn(
                          "size-8 sm:size-10 rounded-lg sm:rounded-xl flex items-center justify-center text-white transition-all",
                          systemSettings.activeFeatures.includes(feature.id) ? feature.color : "bg-primary/10 text-primary"
                        )}>
                          <Icon name={feature.icon} className="text-base sm:text-lg" />
                        </div>
                        <span className={cn(
                          "text-[9px] sm:text-[10px] font-black uppercase tracking-widest",
                          systemSettings.activeFeatures.includes(feature.id) ? "text-primary" : "text-neutral-muted"
                        )}>
                          {feature.label}
                        </span>
                        <div className={cn(
                          "size-1 sm:size-1.5 rounded-full mt-0.5 sm:mt-1",
                          systemSettings.activeFeatures.includes(feature.id) ? "bg-primary animate-pulse" : "bg-primary/20"
                        )} />
                      </button>
                    ))}
                  </div>
                </Card>

                <Card className="p-6 sm:p-10 bg-primary text-white rounded-2xl sm:rounded-[3rem] border-none shadow-2xl shadow-primary/20 overflow-hidden relative">
                  <div className="absolute -bottom-6 -right-6 sm:-bottom-10 sm:-right-10 opacity-10">
                    <Icon name="terminal" className="text-[6rem] sm:text-[10rem]" />
                  </div>
                  <div className="relative z-10 space-y-4 sm:space-y-6">
                    <h3 className="font-black uppercase italic tracking-tight text-lg sm:text-xl">System Reset</h3>
                    <p className="text-white/60 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                      Perform a complete protocol reset. This action will terminate all active sessions and clear temporary cache.
                    </p>
                    <Button className="w-full h-12 sm:h-14 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-xl sm:rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all">
                      Initialize Factory Reset
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          </motion.div>
        )}
        </main>
      </div>

      {/* Edit/Add User Modal */}
      <AnimatePresence>
        {(editingUser || isAddingUser) && (
          <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setEditingUser(null);
                setIsAddingUser(false);
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-6 sm:p-10 space-y-6 sm:space-y-8 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between sticky top-0 bg-white z-10 pb-4 border-b border-primary/5">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-slate-800 uppercase italic tracking-tight">
                      {isAddingUser ? 'Add New Member' : 'Edit Member'}
                    </h3>
                    <p className="text-[10px] sm:text-[12px] font-bold text-neutral-muted uppercase tracking-widest">Configure access and identity</p>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingUser(null);
                      setIsAddingUser(false);
                    }} 
                    className="size-10 sm:size-12 rounded-full bg-primary/5 flex items-center justify-center text-neutral-muted hover:text-primary transition-colors"
                  >
                    <Icon name="close" className="text-xl" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-12">
                  <div className="space-y-6 sm:space-y-8">
                    {isAddingUser && (
                      <div className="space-y-3">
                        <label className="text-[10px] sm:text-[12px] font-black text-neutral-muted uppercase tracking-widest px-1">Search Existing Member</label>
                        <div className="relative">
                          <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-muted" />
                          <input 
                            type="text" 
                            placeholder="Search by name or username..."
                            value={userSearchQuery}
                            onChange={(e) => setUserSearchQuery(e.target.value)}
                            className="w-full bg-primary/5 border border-primary/5 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                          />
                        </div>
                        {userSearchQuery && (
                          <div className="absolute z-20 w-full bg-white border border-primary/5 rounded-xl overflow-hidden max-h-40 overflow-y-auto shadow-xl mt-1">
                            {users.filter(u => 
                              !(u.isAdmin || u.allowedTabs?.length) && 
                              (u.displayName.toLowerCase().includes(userSearchQuery.toLowerCase()) || u.username.toLowerCase().includes(userSearchQuery.toLowerCase()))
                            ).map(u => (
                              <button
                                key={`search-user-${u.id}`}
                                onClick={() => {
                                  setEditingUser(u);
                                  setIsAddingUser(false);
                                  setEditForm({
                                    displayName: u.displayName,
                                    username: u.username,
                                    description: u.description || '',
                                    isAdmin: u.isAdmin || false,
                                    avatar: u.avatar || '',
                                    allowedTabs: u.allowedTabs || [],
                                    accessibleTeamMembers: u.accessibleTeamMembers || []
                                  });
                                  setUserSearchQuery('');
                                }}
                                className="w-full px-4 py-3 text-left hover:bg-primary/5 flex items-center gap-3 transition-colors border-b border-primary/5 last:border-0"
                              >
                                <Avatar src={u.avatar} className="size-10" />
                                <div>
                                  <p className="text-xs font-black uppercase italic">{u.displayName}</p>
                                  <p className="text-[8px] font-bold text-neutral-muted uppercase tracking-widest">{u.username}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {!isAddingUser && (
                      <>
                        <div className="space-y-3">
                          <label className="text-[10px] sm:text-[12px] font-black text-neutral-muted uppercase tracking-widest px-1">Member Identity</label>
                      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                        {editingUser && editForm.avatar && (
                          <Avatar src={editForm.avatar} className="size-20 sm:size-24 rounded-2xl sm:rounded-3xl" />
                        )}
                        <div className="flex-1 space-y-3">
                          <input 
                            type="text" 
                            placeholder="Display Name"
                            value={editForm.displayName}
                            onChange={(e) => setEditForm(prev => ({ ...prev, displayName: e.target.value }))}
                            className="w-full bg-primary/5 border border-primary/5 rounded-2xl px-5 py-4 text-sm font-black uppercase tracking-tight italic focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                          />
                          <input 
                            type="text" 
                            placeholder="username"
                            value={editForm.username}
                            onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                            className="w-full bg-primary/5 border border-primary/5 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] sm:text-[12px] font-black text-neutral-muted uppercase tracking-widest px-1">Member Bio</label>
                      <textarea 
                        placeholder="Bio..."
                        value={editForm.description}
                        onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full h-32 sm:h-40 bg-primary/5 border border-primary/5 rounded-2xl px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none"
                      />
                    </div>
                  </>
                )}
              </div>

              {!isAddingUser && (
                <div className="space-y-6 sm:space-y-8">
                    <div className="space-y-3">
                      <label className="text-[10px] sm:text-[12px] font-black text-neutral-muted uppercase tracking-widest px-1">Role & Access</label>
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          onClick={() => setEditForm(prev => ({ ...prev, isAdmin: false }))}
                          className={cn(
                            "p-5 sm:p-6 rounded-2xl border transition-all flex flex-col items-center gap-3",
                            !editForm.isAdmin 
                              ? "bg-primary/5 border-primary/20 text-primary"
                              : "bg-white border-primary/5 text-neutral-muted"
                          )}
                        >
                          <Icon name="person" className="text-xl" />
                          <span className="text-[10px] sm:text-[12px] font-black uppercase tracking-widest">Member</span>
                        </button>
                        <button 
                          onClick={() => setEditForm(prev => ({ ...prev, isAdmin: true }))}
                          className={cn(
                            "p-5 sm:p-6 rounded-2xl border transition-all flex flex-col items-center gap-3",
                            editForm.isAdmin 
                              ? "bg-primary/5 border-primary/20 text-primary"
                              : "bg-white border-primary/5 text-neutral-muted"
                          )}
                        >
                          <Icon name="shield" className="text-xl" />
                          <span className="text-[10px] sm:text-[12px] font-black uppercase tracking-widest">Admin</span>
                        </button>
                      </div>
                    </div>

                    {!editForm.isAdmin && (
                      <div className="space-y-4">
                        <label className="text-[10px] sm:text-[12px] font-black text-neutral-muted uppercase tracking-widest px-1">Team Role</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {TEAM_ROLES.map(role => (
                            <button 
                              key={`team-role-${role.id}`}
                              onClick={() => setEditForm(prev => ({ ...prev, teamRole: role.id }))}
                              className={cn(
                                "p-3 sm:p-4 rounded-xl border transition-all flex flex-col items-center gap-2",
                                editForm.teamRole === role.id
                                  ? "bg-primary/5 border-primary/20 text-primary shadow-sm"
                                  : "bg-white border-primary/5 text-neutral-muted hover:border-primary/20"
                              )}
                            >
                              <Icon name={role.icon} className="text-lg" />
                              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-center">{role.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {!editForm.isAdmin && editForm.teamRole && (
                      <div className="space-y-4">
                        <label className="text-[10px] sm:text-[12px] font-black text-neutral-muted uppercase tracking-widest px-1">Working Section Access</label>
                        <div className="grid grid-cols-2 gap-3">
                          {ADMIN_TABS.map((tab, index) => (
                            <button 
                              key={`selective-access-${tab.id}-${index}`}
                              onClick={() => {
                                const newTabs = editForm.allowedTabs.includes(tab.id)
                                  ? editForm.allowedTabs.filter(t => t !== tab.id)
                                  : [...editForm.allowedTabs, tab.id];
                                setEditForm(prev => ({ ...prev, allowedTabs: newTabs }));
                              }}
                              className={cn(
                                "p-4 rounded-xl border transition-all flex items-center gap-3",
                                editForm.allowedTabs.includes(tab.id)
                                  ? "bg-primary/5 border-primary/20 text-primary"
                                  : "bg-primary/5 border-transparent text-neutral-muted"
                              )}
                            >
                              <Icon name={tab.icon} className="text-lg" />
                              <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-widest">{tab.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {!editForm.isAdmin && editForm.teamRole && (
                      <div className="space-y-4">
                        <label className="text-[10px] sm:text-[12px] font-black text-neutral-muted uppercase tracking-widest px-1">Team Member Access</label>
                        <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                          {users.filter(u => (u.isAdmin || u.allowedTabs?.length || u.teamRole) && u.id !== editingUser?.id).map(u => (
                            <button
                              key={`team-access-${u.id}`}
                              onClick={() => {
                                const newMembers = editForm.accessibleTeamMembers.includes(u.id)
                                  ? editForm.accessibleTeamMembers.filter(id => id !== u.id)
                                  : [...editForm.accessibleTeamMembers, u.id];
                                setEditForm(prev => ({ ...prev, accessibleTeamMembers: newMembers }));
                              }}
                              className={cn(
                                "flex flex-col items-center gap-2 min-w-[64px] p-2 rounded-2xl transition-all border-2",
                                editForm.accessibleTeamMembers.includes(u.id) 
                                  ? "bg-primary/10 border-primary shadow-lg shadow-primary/20" 
                                  : "bg-white border-transparent hover:border-primary/20"
                              )}
                            >
                              <div className="relative">
                                <Avatar src={u.avatar} className="size-10 rounded-xl shadow-sm" />
                                {editForm.accessibleTeamMembers.includes(u.id) && (
                                  <div className="absolute -top-1 -right-1 size-4 bg-primary text-white rounded-full flex items-center justify-center shadow-md border border-white">
                                    <Icon name="check" className="text-[8px]" />
                                  </div>
                                )}
                              </div>
                              <span className="text-[7px] font-black uppercase text-slate-900 text-center line-clamp-1 w-full">{u.displayName}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-6 sm:pt-10 border-t border-primary/5">
              <Button 
                onClick={() => {
                  setEditingUser(null);
                  setIsAddingUser(false);
                }}
                className="flex-1 bg-primary/5 text-neutral-muted hover:bg-primary/10 border-none shadow-none text-[10px] sm:text-[12px] font-black uppercase tracking-widest h-14 sm:h-16 rounded-xl sm:rounded-2xl"
              >
                Cancel
              </Button>
              {!isAddingUser && (
                <Button 
                  onClick={handleSaveEdit}
                  className="flex-1 h-14 sm:h-16 text-[10px] sm:text-[12px] font-black uppercase tracking-widest bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20 border-none rounded-xl sm:rounded-2xl"
                >
                  Save Changes
                </Button>
              )}
            </div>
              </div>
            </motion.div>
          </div>
        )}
        {/* Flag User Modal */}
        {flaggingUser && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-amber-100"
            >
              <div className="p-6 sm:p-8">
                <div className="flex items-center gap-4 mb-8">
                  <div className="size-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center">
                    <Icon name="flag" className="text-2xl" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 italic uppercase tracking-tight">Flag Member</h3>
                    <p className="text-[10px] sm:text-[12px] text-neutral-muted font-bold uppercase tracking-widest">Provide a reason for flagging {flaggingUser.username}</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] sm:text-[12px] font-black text-neutral-muted uppercase tracking-widest block px-1">Reason Category</label>
                    <select
                      value={selectedFlagOption}
                      onChange={(e) => setSelectedFlagOption(e.target.value)}
                      className="w-full p-5 bg-primary/5 border border-primary/5 rounded-2xl text-xs sm:text-sm font-bold text-slate-700 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all appearance-none cursor-pointer"
                    >
                      {FLAG_OPTIONS.map(option => (
                        <option key={`flag-option-${option}`} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] sm:text-[12px] font-black text-neutral-muted uppercase tracking-widest block px-1">Detailed Description</label>
                    <textarea
                      value={flagReason}
                      onChange={(e) => setFlagReason(e.target.value)}
                      placeholder="Provide more context about this flag..."
                      className="w-full h-32 sm:h-40 p-5 bg-primary/5 border border-primary/5 rounded-2xl text-xs sm:text-sm font-bold text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all resize-none"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mt-10">
                  <Button 
                    onClick={() => {
                      setFlaggingUser(null);
                      setFlagReason('');
                      setSelectedFlagOption(FLAG_OPTIONS[0]);
                    }}
                    className="flex-1 bg-primary/5 text-neutral-muted hover:bg-primary/10 border-none shadow-none text-[10px] sm:text-[12px] font-black uppercase tracking-widest h-14 sm:h-16 rounded-xl sm:rounded-2xl"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => {
                      const finalReason = `[${selectedFlagOption}] ${flagReason.trim()}`;
                      flagUser(flaggingUser.id, finalReason);
                      setFlaggingUser(null);
                      setFlagReason('');
                      setSelectedFlagOption(FLAG_OPTIONS[0]);
                      setShowSuccessMessage('Member flagged successfully');
                      setTimeout(() => setShowSuccessMessage(null), 3000);
                    }}
                    className="flex-1 h-14 sm:h-16 text-[10px] sm:text-[12px] font-black uppercase tracking-widest bg-amber-500 hover:bg-amber-600 text-white border-none shadow-lg shadow-amber-500/20 rounded-xl sm:rounded-2xl"
                  >
                    Flag Member
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Success Message */}
        <AnimatePresence>
          {showSuccessMessage && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[110] bg-primary text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10"
            >
              <div className="size-6 rounded-full bg-white/20 text-white flex items-center justify-center">
                <Icon name="check" className="text-xs" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest">{showSuccessMessage}</p>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Broadcast Template Modal */}
        {showTemplateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-2xl bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 sm:p-12 space-y-8 sm:space-y-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                      <Icon name="description" className="text-2xl" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Broadcast Templates</h3>
                  </div>
                  <button onClick={() => setShowTemplateModal(false)} className="size-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary hover:bg-primary/10 transition-all">
                    <Icon name="close" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  {broadcastTemplates.map(template => (
                    <div key={template.id} className="p-6 bg-primary/5 rounded-3xl border-2 border-transparent hover:border-primary/20 transition-all group">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[8px] font-black text-primary uppercase tracking-widest px-2 py-1 bg-primary/10 rounded-lg">{template.type}</span>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setPreviewTemplate({ name: template.name, content: template.content })}
                            className="size-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-primary hover:scale-105 transition-transform"
                          >
                            <Icon name="visibility" className="text-sm" />
                          </button>
                          <button 
                            onClick={() => {
                              setBroadcastMsg(template.content);
                              setBroadcastType(template.type);
                              setShowTemplateModal(false);
                            }}
                            className="size-8 rounded-lg bg-primary text-white shadow-lg shadow-primary/20 flex items-center justify-center hover:scale-105 transition-transform"
                          >
                            <Icon name="check" className="text-sm" />
                          </button>
                        </div>
                      </div>
                      <h4 className="text-sm font-black text-slate-900 uppercase italic tracking-tight mb-2">{template.name}</h4>
                      <p className="text-[9px] font-bold text-neutral-muted uppercase tracking-wide line-clamp-2 italic">"{template.content}"</p>
                    </div>
                  ))}
                  <button 
                    onClick={() => setIsCreatingTemplate(true)}
                    className="p-6 bg-primary/5 rounded-3xl border-2 border-dashed border-primary/20 flex flex-col items-center justify-center text-primary hover:bg-primary/10 transition-all group"
                  >
                    <Icon name="add" className="text-2xl mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Create Template</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Template Preview Modal */}
        {previewTemplate && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-primary/10"
            >
              <div className="p-8 sm:p-10 space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                      <Icon name="visibility" className="text-xl" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 uppercase italic tracking-tight">Broadcast Preview</h3>
                  </div>
                  <button onClick={() => setPreviewTemplate(null)} className="size-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary hover:bg-primary/10 transition-all">
                    <Icon name="close" />
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div className="relative p-8 bg-slate-900 rounded-[2rem] text-white overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
                      <Icon name="campaign" className="text-6xl -rotate-12" />
                    </div>
                    
                    <div className="relative z-10 space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                          <Icon name="campaign" className="text-lg" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">System Protocol</p>
                          <p className="text-[8px] font-bold uppercase tracking-widest opacity-50">Transmission ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <h4 className="text-xl font-black uppercase italic tracking-tighter leading-none">{previewTemplate.name}</h4>
                        <p className="text-sm font-bold uppercase tracking-wide leading-relaxed italic text-slate-300">"{previewTemplate.content}"</p>
                      </div>

                      <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center gap-2">
                          <div className="size-2 rounded-full bg-primary animate-pulse" />
                          <span className="text-[8px] font-black uppercase tracking-widest opacity-50">Live Transmission Active</span>
                        </div>
                        <div className="px-4 py-2 bg-primary/20 text-primary text-[9px] font-black uppercase tracking-[0.2em] rounded-xl border border-primary/30 backdrop-blur-sm">
                          Action Required
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10">
                    <div className="flex items-center gap-3 mb-2">
                      <Icon name="info" className="text-primary text-sm" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Audience Reach</span>
                    </div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-neutral-muted italic">This message will be visible to {broadcastAudience === 'all' ? 'all protocol nodes' : broadcastAudience} across the network.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button 
                    onClick={() => setPreviewTemplate(null)}
                    className="flex-1 h-16 bg-primary/5 text-primary hover:bg-primary/10 rounded-2xl text-[10px] font-black uppercase tracking-widest border-none"
                  >
                    Close
                  </Button>
                  <Button 
                    onClick={() => {
                      handleSendBroadcast();
                      setPreviewTemplate(null);
                    }}
                    className="flex-1 h-16 bg-primary text-white hover:bg-primary-dark rounded-2xl text-[10px] font-black uppercase tracking-widest border-none shadow-xl shadow-primary/20"
                  >
                    Execute Now
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Create Template Modal */}
        {isCreatingTemplate && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden">
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Create Template</h3>
                  <button onClick={() => setIsCreatingTemplate(false)} className="text-neutral-muted hover:text-primary"><Icon name="close" /></button>
                </div>
                <div className="space-y-4">
                  <input 
                    type="text" 
                    placeholder="TEMPLATE NAME" 
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full p-4 bg-primary/5 border border-primary/5 rounded-xl text-xs font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <textarea 
                    placeholder="CONTENT..." 
                    value={newTemplate.content}
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, content: e.target.value }))}
                    className="w-full h-32 p-4 bg-primary/5 border border-primary/5 rounded-xl text-xs font-bold uppercase tracking-wide outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                  <select 
                    value={newTemplate.type}
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full p-4 bg-primary/5 border border-primary/5 rounded-xl text-xs font-black uppercase tracking-widest outline-none"
                  >
                    <option value="info">INFO</option>
                    <option value="warning">WARNING</option>
                    <option value="error">ERROR</option>
                    <option value="announcement">ANNOUNCEMENT</option>
                    <option value="maintenance">MAINTENANCE</option>
                    <option value="security">SECURITY</option>
                  </select>
                </div>
                <Button 
                  onClick={() => {
                    setBroadcastTemplates(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), ...newTemplate }]);
                    setIsCreatingTemplate(false);
                    setNewTemplate({ name: '', content: '', type: 'info' });
                    setShowSuccessMessage('Template created successfully');
                    setTimeout(() => setShowSuccessMessage(null), 3000);
                  }}
                  className="w-full h-14 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest border-none"
                >
                  Save Template
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Create Service Modal */}
        {isCreatingService && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden">
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">New Service</h3>
                  <button onClick={() => setIsCreatingService(false)} className="text-neutral-muted hover:text-primary"><Icon name="close" /></button>
                </div>
                <div className="space-y-4">
                  <input 
                    type="text" 
                    placeholder="SERVICE NAME" 
                    value={newService.name}
                    onChange={(e) => setNewService(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full p-4 bg-primary/5 border border-primary/5 rounded-xl text-xs font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <textarea 
                    placeholder="DESCRIPTION..." 
                    value={newService.description}
                    onChange={(e) => setNewService(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full h-24 p-4 bg-primary/5 border border-primary/5 rounded-xl text-xs font-bold uppercase tracking-wide outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                </div>
                <Button 
                  onClick={() => {
                    setIsCreatingService(false);
                    setNewService({ name: '', description: '', icon: 'hub' });
                    setShowSuccessMessage('Service connection initiated');
                    setTimeout(() => setShowSuccessMessage(null), 3000);
                  }}
                  className="w-full h-14 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest border-none"
                >
                  Connect Service
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Create Webhook Modal */}
        {isCreatingWebhook && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden">
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Create Webhook</h3>
                  <button onClick={() => setIsCreatingWebhook(false)} className="text-neutral-muted hover:text-primary"><Icon name="close" /></button>
                </div>
                <div className="space-y-4">
                  <input 
                    type="text" 
                    placeholder="WEBHOOK NAME" 
                    value={newWebhook.name}
                    onChange={(e) => setNewWebhook(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full p-4 bg-primary/5 border border-primary/5 rounded-xl text-xs font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input 
                    type="text" 
                    placeholder="ENDPOINT URL (HTTPS://...)" 
                    value={newWebhook.url}
                    onChange={(e) => setNewWebhook(prev => ({ ...prev, url: e.target.value }))}
                    className="w-full p-4 bg-primary/5 border border-primary/5 rounded-xl text-xs font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <Button 
                  onClick={() => {
                    setIsCreatingWebhook(false);
                    setNewWebhook({ name: '', url: '', events: [] });
                    setShowSuccessMessage('Webhook created successfully');
                    setTimeout(() => setShowSuccessMessage(null), 3000);
                  }}
                  className="w-full h-14 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest border-none"
                >
                  Create Webhook
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
