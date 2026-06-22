import { BASE } from '@/config/config'
import { SafeImg } from '@/components/SafeImg'

export const SplashView = () => {
  return (
    <div className='fixed inset-0 bg-white flex flex-col items-center justify-center animate-in fade-in duration-700'>
      <SafeImg
        src={`${BASE}logo.png`}
        alt='MainWRLD'
        className='w-24 h-24 mb-4'
      />
      <SafeImg src={`${BASE}wordlogo.png`} alt='MainWRLD' className='h-8' />
    </div>
  )
}
