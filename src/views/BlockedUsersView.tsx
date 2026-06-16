import { useApp } from '@/state/AppContext'

export const BlockedUsersView = () => {
  const {
    setView,
    registeredUsers,
    MUTUALS,
    blockedUsers,
    handleUnblockUser
  } = useApp()
  return (
    <div className='fixed inset-0 bg-white p-8 overflow-y-auto no-scrollbar animate-in slide-in-from-right duration-500'>
      <header className='flex items-center gap-4 mb-10'>
        <button
          onClick={() => setView('settings')}
          className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <h1 className='text-xl font-bold'>Blocked Users</h1>
        <span className='text-[10px] font-bold text-gray-300 uppercase tracking-widest'>
          {blockedUsers.size}
        </span>
      </header>
      {blockedUsers.size === 0 ? (
        <div className='flex flex-col items-center justify-center h-64 text-gray-300'>
          <span className='material-icons-round text-4xl mb-4'>
            block
          </span>
          <p className='text-[10px] font-bold uppercase tracking-widest'>
            No blocked users
          </p>
        </div>
      ) : (
        <div className='space-y-3'>
          {[...blockedUsers].map(blockedUsername => {
            const blockedUser =
              registeredUsers.find(u => u.username === blockedUsername) ||
              MUTUALS.find(u => u.username === blockedUsername)
            return (
              <div
                key={blockedUsername}
                className='flex items-center gap-4 p-5 bg-gray-50 rounded-3xl border border-gray-100'
              >
                <div className='w-12 h-12 rounded-2xl bg-gray-200 flex items-center justify-center text-gray-400'>
                  <span className='material-icons-round'>person</span>
                </div>
                <div className='flex-1 min-w-0'>
                  <p className='text-sm font-bold truncate'>
                    {blockedUser?.displayName || blockedUsername}
                  </p>
                  <p className='text-[10px] text-gray-400 font-bold'>
                    @{blockedUsername}
                  </p>
                </div>
                <button
                  onClick={() => handleUnblockUser(blockedUsername)}
                  className='px-5 py-2.5 bg-white rounded-2xl text-xs font-bold border border-gray-200 text-gray-500 transition-all active:scale-95 hover:border-accent hover:text-accent'
                >
                  Unblock
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
