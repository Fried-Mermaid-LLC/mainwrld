import React from 'react'

// Ad banner shown at end of chapters (skipped for premium users)
export const ChapterAdBanner = ({
  isPremium = false,
  inverted = false
}: {
  isPremium?: boolean
  inverted?: boolean
}) => {
  if (isPremium) return null

  // Placeholder ad slot — replace with Google AdSense or ad network script
  return (
    <div
      className={`my-10 p-6 rounded-3xl border-2 border-dashed text-center space-y-3 ${
        inverted
          ? 'border-gray-700 bg-gray-900/50'
          : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div
        className={`text-[8px] font-bold uppercase tracking-[0.3em] ${
          inverted ? 'text-gray-500' : 'text-gray-300'
        }`}
      >
        Advertisement
      </div>
      <div
        className={`h-24 rounded-2xl flex items-center justify-center ${
          inverted ? 'bg-gray-800' : 'bg-gray-100'
        }`}
      >
        {/* Google AdSense or ad network slot goes here */}
        {/* <ins className="adsbygoogle" data-ad-client="ca-pub-XXXX" data-ad-slot="XXXX" data-ad-format="auto" /> */}
        <div
          className={`text-center ${
            inverted ? 'text-gray-600' : 'text-gray-300'
          }`}
        >
          <span className='material-icons-round text-2xl mb-1'>campaign</span>
          <p className='text-[9px] font-bold uppercase tracking-widest'>
            Ad Space
          </p>
        </div>
      </div>
      <p
        className={`text-[7px] font-bold uppercase tracking-widest ${
          inverted ? 'text-gray-600' : 'text-gray-300'
        }`}
      >
        Support the author •{' '}
        <span className='text-accent cursor-pointer'>Go Premium</span> to remove
        ads
      </p>
    </div>
  )
}
