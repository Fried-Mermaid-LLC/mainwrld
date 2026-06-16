import * as fbService from '@/services/firebaseService'
import { useApp } from '@/state/AppContext'

export const NotificationsView = () => {
  const {
    setView,
    user,
    notifications,
    blockedUsers,
    handleNotificationClick
  } = useApp()
  // Sort once: newest first
  const sortedNotifs = notifications
    .filter(
      n =>
        n.recipient === user.username && !blockedUsers.has(n.sender || '')
    )
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, 20)
  // Mark all as read after a short delay so user sees unread state first
  if (sortedNotifs.some(n => !n.read)) {
    setTimeout(
      () =>
        fbService
          .markNotificationsRead(user.username)
          .catch(console.error),
      2000
    )
  }
  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar animate-in slide-in-from-right duration-500'>
      <header className='p-6 flex items-center gap-4'>
        <button
          onClick={() => setView('home')}
          className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <h1 className='text-xl font-bold'>Notifications</h1>
      </header>

      <div className='p-6 space-y-4'>
        {sortedNotifs.length > 0 ? (
          sortedNotifs.map(n => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`p-5 rounded-[1.5rem] border flex gap-4 cursor-pointer items-start hover:opacity-75 transition-opacity ${
                !n.read
                  ? 'bg-accent/10 border-accent/20'
                  : 'bg-accent/5 border-accent/10'
              }`}
            >
              <div className='relative shrink-0 pointer-events-none'>
                <div className='w-12 h-12 rounded-2xl bg-accent text-white flex items-center justify-center'>
                  <span className='material-icons-round'>{n.icon}</span>
                </div>
                {!n.read && (
                  <span className='absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white' />
                )}
              </div>
              <div className='min-w-0 pointer-events-none'>
                <p
                  className={`text-xs font-bold ${
                    !n.read ? 'text-black' : 'text-gray-600'
                  }`}
                >
                  {n.title}
                </p>
                <p className='text-[10px] text-gray-400'>{n.message}</p>
              </div>
            </div>
          ))
        ) : (
          <div className='text-center py-20 text-gray-300 font-bold uppercase tracking-widest text-[10px]'>
            No new notifications
          </div>
        )}
      </div>
    </div>
  )
}
