import { useApp } from '@/state/AppContext'

export const NotificationSettingsView = () => {
  const {
    setView
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
        <h1 className='text-xl font-bold'>Notifications</h1>
      </header>
      <div className='space-y-6'>
        {['New Admirers', 'Book Likes', 'Comments', 'App Updates'].map(
          item => (
            <div
              key={item}
              className='flex justify-between items-center p-6 bg-gray-50 rounded-3xl'
            >
              <span className='text-sm font-bold'>{item}</span>
              <input
                type='checkbox'
                defaultChecked
                className='accent-accent w-5 h-5'
              />
            </div>
          )
        )}
      </div>
    </div>
  )
}
