import React, { useState, useEffect, use } from 'react';
import { BASE } from '@/config/config';
import { AvatarLayers, AVATAR_ITEMS, getHairPosition, getFacePosition, HAIR_POSITIONS, FACE_POSITIONS } from '@/components/avatar';
import { SafeImg } from '@/components/SafeImg';
import { AvatarCategory, AvatarConfig, AvatarGender, AvatarItem, User } from '@/types';
import { useApp } from '@/state/AppContext';
import * as fbService from '@/services/firebaseService';

interface CustomizationViewProps {
    user: User;
    setUser: (user: User) => void;
    onBack: () => void;
    avatarConfig: AvatarConfig | null;
    setAvatarConfig: (config: AvatarConfig | null) => void;
    unlockedAvatarItems: Set<string>;
    setUnlockedAvatarItems: (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    isAdmin: boolean;
    getItemCost: (itemId: string) => number;
}

export const CustomizationView = ({ onboarding = false }: { onboarding?: boolean } = {}) => {
    const {
        user,
        setUser,
        avatarConfig,
        setAvatarConfig,
        unlockedAvatarItems,
        setUnlockedAvatarItems,
        isAdmin,
        getItemCost,
        setView,
        firebaseUid,
    } = useApp()
    const onBack = () => setView('self-profile')
    const [activeCategory, setActiveCategory] = useState<AvatarCategory>('body');
    const [pendingUnlock, setPendingUnlock] = useState<{ id: string; cost: number } | null>(null);
    const [localConfig, setLocalConfig] = useState<AvatarConfig | null>(avatarConfig);
    const [showGenderPick, setShowGenderPick] = useState(!avatarConfig);
    const [adjustMode, setAdjustMode] = useState(false);
    const [adjustTarget, setAdjustTarget] = useState<'hair' | 'face'>('hair');
    const [adj, setAdj] = useState<{ width: number; left: number; top: number }>({ width: 38, left: 31, top: -5 });
    const [zoomLevel, setZoomLevel] = useState(1);

    useEffect(() => {
        if (!localConfig) return;
        if (adjustTarget === 'hair' && localConfig.hairId !== 'none') {
            const pos = getHairPosition(localConfig.hairId);
            setAdj({ width: parseFloat(pos.width), left: parseFloat(pos.left), top: parseFloat(pos.top) });
        } else if (adjustTarget === 'face') {
            const pos = getFacePosition(localConfig.faceId);
            setAdj({ width: parseFloat(pos.width), left: parseFloat(pos.left), top: parseFloat(pos.top) });
        }
    }, [localConfig?.hairId, localConfig?.faceId, adjustTarget]);

    useEffect(() => {
        if (activeCategory === 'hair') setAdjustTarget('hair');
        else if (activeCategory === 'face') setAdjustTarget('face');
        else setAdjustMode(false);
    }, [activeCategory]);

    const handleApplyPosition = () => {
        if (!localConfig) return;
        const pos = { width: `${adj.width}%`, left: `${adj.left}%`, top: `${adj.top}%` };
        if (adjustTarget === 'hair' && localConfig.hairId !== 'none') {
            HAIR_POSITIONS[localConfig.hairId] = pos;
            localStorage.setItem('mainwrld_hair_positions', JSON.stringify(HAIR_POSITIONS));
        } else if (adjustTarget === 'face') {
            FACE_POSITIONS[localConfig.faceId] = pos;
            localStorage.setItem('mainwrld_face_positions', JSON.stringify(FACE_POSITIONS));
        }
        setAdjustMode(false);
    };

    const handleExportPositions = () => {
        const data = JSON.stringify({ hair: HAIR_POSITIONS, face: FACE_POSITIONS }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mainwrld-positions.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportPositions = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target?.result as string);
                    if (data.hair) {
                        Object.assign(HAIR_POSITIONS, data.hair);
                        localStorage.setItem('mainwrld_hair_positions', JSON.stringify(HAIR_POSITIONS));
                    }
                    if (data.face) {
                        Object.assign(FACE_POSITIONS, data.face);
                        localStorage.setItem('mainwrld_face_positions', JSON.stringify(FACE_POSITIONS));
                    }
                } catch {
                    // Invalid format
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const categories: { key: AvatarCategory; label: string; icon: string }[] = [
        { key: 'body', label: 'Skin Tone', icon: 'accessibility_new' },
        { key: 'face', label: 'Face', icon: 'face' },
        { key: 'hair', label: 'Hair', icon: 'content_cut' },
        { key: 'outfit', label: 'Outfits', icon: 'checkroom' },
    ];

    const initDefaults = (gender: AvatarGender): AvatarConfig => ({
        gender,
        bodyId: gender === 'female' ? 'A4' : 'B4',
        faceId: gender === 'female' ? 'W_Eye_1' : 'M_Eye_1',
        hairId: gender === 'female' ? 'W_Hair_2' : 'M_Hair_1',
        outfitId: gender === 'female' ? 'D4' : 'E1',
    });

    const handleGenderSelect = (gender: AvatarGender) => {
        const defaults = initDefaults(gender);
        setLocalConfig(defaults);
        setShowGenderPick(false);
    };

    const handleSelectItem = (item: AvatarItem) => {
        if (!localConfig) return;
        const cost = getItemCost(item.id);
        const isUnlocked = cost === 0 || unlockedAvatarItems.has(item.id);
        if (!isUnlocked) {
            if (user.points >= cost) setPendingUnlock({ id: item.id, cost });
            return;
        }
        const key = item.category === 'body'
            ? 'bodyId'
            : item.category === 'face'
                ? 'faceId'
                : item.category === 'hair'
                    ? 'hairId'
                    : 'outfitId';
        setLocalConfig({ ...localConfig, [key]: item.id });
    };

    const handleUnlockConfirm = () => {
        if (!pendingUnlock || !localConfig) return;
        const { id, cost } = pendingUnlock;
        setUser({ ...user, points: user.points - cost });
        setUnlockedAvatarItems((prev: Set<string>) => new Set([...prev, id]));
        const item = AVATAR_ITEMS.find(i => i.id === id);
        if (item) {
            const key = item.category === 'body'
                ? 'bodyId'
                : item.category === 'face'
                    ? 'faceId'
                    : item.category === 'hair'
                        ? 'hairId'
                        : 'outfitId';
            setLocalConfig({ ...localConfig, [key]: id });
        }
        setPendingUnlock(null);
    };

    // JEVON - logging avatar config for referencing

    const handleSave = () => {
        if (localConfig) {
            setAvatarConfig(localConfig);
            // Onboarding: persist immediately so the choice survives an app kill
            // before the 2s debounced batch write, and so the gate (which keys off
            // avatarConfig) clears to reveal the world.
            if (onboarding && firebaseUid) {
                fbService
                    .updateUserProfile(firebaseUid, { avatarConfig: localConfig })
                    .catch(console.error);
            }
        }
        if (!onboarding) onBack();
    };

    useEffect(() => {
        console.log("AvatarConfig updated:", avatarConfig);
    }, [avatarConfig]);

    const filteredItems = AVATAR_ITEMS.filter(item => {
        if (item.category !== activeCategory) return false;
        if (!localConfig) return false;
        if (item.gender === 'any') return true;
        return item.gender === localConfig.gender;
    });

    const getSelectedId = (): string => {
        if (!localConfig) return '';
        if (activeCategory === 'body') return localConfig.bodyId;
        if (activeCategory === 'face') return localConfig.faceId;
        if (activeCategory === 'hair') return localConfig.hairId;
        return localConfig.outfitId;
    };

    if (showGenderPick) {
        return (
            <div className="fixed inset-0 bg-white flex flex-col animate-in slide-in-from-right duration-500 z-[300]">
                <header className="p-6 border-b flex justify-between items-center bg-white/80 backdrop-blur-md">
                    {onboarding ? (
                        <div className="w-10" />
                    ) : (
                        <button onClick={onBack} className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
                            <span className="material-icons-round">arrow_back</span>
                        </button>
                    )}
                    <h1 className="text-lg font-bold">{onboarding ? 'Create Your Character' : 'Choose Your Style'}</h1>
                    <div className="w-10" />
                </header>
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                    {onboarding && (
                        <div className="text-center mb-10 max-w-xs">
                            <h2 className="text-xl font-bold mb-2">Welcome to MainWRLD</h2>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Let's set up your character. Pick a starting look — you can fine-tune everything next.
                            </p>
                        </div>
                    )}
                    <div className="flex items-stretch justify-center gap-4 md:gap-8 w-full max-w-md">
                        <button onClick={() => handleGenderSelect('female')} className="flex-1 min-w-0 flex flex-col items-center gap-4 p-4 md:p-6 rounded-3xl border-2 border-gray-200 hover:border-accent hover:bg-accent/5 transition-all active:scale-95 max-w-56">
                            <div className="w-full aspect-32/44 rounded-2xl overflow-hidden bg-gray-50">
                                <SafeImg src={`${BASE}assets/avatar/body/female/A4.png`} alt="Female" className="w-full h-full object-contain" />
                            </div>
                            <span className="text-sm font-bold uppercase tracking-widest">Female</span>
                        </button>
                        <button onClick={() => handleGenderSelect('male')} className="flex-1 min-w-0 flex flex-col items-center gap-4 p-4 md:p-6 rounded-3xl border-2 border-gray-200 hover:border-accent hover:bg-accent/5 transition-all active:scale-95 max-w-56">
                            <div className="w-full aspect-32/44 rounded-2xl overflow-hidden bg-gray-50">
                                <SafeImg src={`${BASE}assets/avatar/body/male/B4.png`} alt="Male" className="w-full h-full object-contain" />
                            </div>
                            <span className="text-sm font-bold uppercase tracking-widest">Male</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-white flex flex-col animate-in slide-in-from-right duration-500 z-[300]">
            <header className="p-4 border-b flex justify-between items-center bg-white/80 backdrop-blur-md">
                {onboarding ? (
                    <div className="w-10" />
                ) : (
                    <button onClick={onBack} className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
                        <span className="material-icons-round">arrow_back</span>
                    </button>
                )}
                <div className="text-center">
                    <h1 className="text-lg font-bold">{onboarding ? 'Create Your Character' : 'Customize'}</h1>
                    <p className="text-[10px] font-bold text-accent uppercase tracking-widest">
                        {onboarding ? 'Make it yours' : `${user.points} Points`}
                    </p>
                </div>
                <button onClick={handleSave} className="text-sm font-semibold text-accent hover:opacity-70 transition">
                    {onboarding ? 'Done' : 'Save'}
                </button>
            </header>

            <div className="flex-1 flex flex-col lg:flex-row min-h-0">
            <div className="flex-1 bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center p-4 min-h-0 relative overflow-hidden">
                {localConfig && (
                    <div className="relative w-52 md:w-64 aspect-[140/194] transition-transform duration-300 ease-out" style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center' }}>
                        <AvatarLayers
                            avatarConfig={localConfig}
                            containerClassName="relative w-full h-full"
                            faceShrink={0.96}
                            hairShrink={0.97}
                            hairShift={1}
                            faceStyleOverride={adjustMode && adjustTarget === 'face' ? { width: `${adj.width}%`, left: `${adj.left}%`, top: `${adj.top}%` } : undefined}
                            hairStyleOverride={adjustMode && adjustTarget === 'hair' ? { width: `${adj.width}%`, left: `${adj.left}%`, top: `${adj.top}%` } : (() => {
                                const pos = getHairPosition(localConfig.hairId, 0.925, -0.08);
                                const top = parseFloat(pos.top);
                                return { ...pos, top: `${(top - 0.24).toFixed(3)}%` };
                            })()}
                        />
                    </div>
                )}

                {isAdmin && adjustMode && localConfig && (adjustTarget === 'face' || localConfig.hairId !== 'none') && (
                    <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur rounded-t-2xl shadow-lg p-4 z-50 text-xs">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-gray-700 text-xs">{adjustTarget === 'hair' ? localConfig.hairId : localConfig.faceId}</span>
                            <span className="text-[10px] font-bold text-accent uppercase tracking-widest">{adjustTarget}</span>
                        </div>
                        <div className="space-y-2">
                            <div>
                                <div className="flex justify-between mb-0.5"><span className="text-gray-500">Size</span><span className="font-mono text-gray-600">{adj.width}%</span></div>
                                <input type="range" min="10" max="60" step="0.5" value={adj.width} onChange={e => setAdj(p => ({ ...p, width: +e.target.value }))} className="w-full accent-[#eb6871]" />
                            </div>
                            <div>
                                <div className="flex justify-between mb-0.5"><span className="text-gray-500">Left</span><span className="font-mono text-gray-600">{adj.left}%</span></div>
                                <input type="range" min="10" max="55" step="0.5" value={adj.left} onChange={e => setAdj(p => ({ ...p, left: +e.target.value }))} className="w-full accent-[#eb6871]" />
                            </div>
                            <div>
                                <div className="flex justify-between mb-0.5"><span className="text-gray-500">Top</span><span className="font-mono text-gray-600">{adj.top}%</span></div>
                                <input type="range" min="-15" max="15" step="0.5" value={adj.top} onChange={e => setAdj(p => ({ ...p, top: +e.target.value }))} className="w-full accent-[#eb6871]" />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                            <button onClick={handleApplyPosition} className="flex-1 py-2 bg-accent text-white rounded-full font-bold text-xs">Apply & Save</button>
                            <button onClick={() => setAdjustMode(false)} className="flex-1 py-2 bg-gray-100 text-gray-500 rounded-full font-bold text-xs">Cancel</button>
                        </div>
                    </div>
                )}

                {!adjustMode && (
                    <div className="absolute bottom-3 right-3 flex gap-2">
                        {isAdmin && (activeCategory === 'hair' || activeCategory === 'face') && localConfig && (activeCategory === 'face' || localConfig.hairId !== 'none') && (
                            <button
                                onClick={() => { setAdjustTarget(activeCategory as 'hair' | 'face'); setAdjustMode(!adjustMode); }}
                                className={`px-3 py-1.5 rounded-full backdrop-blur border text-[10px] font-bold uppercase tracking-widest transition ${adjustMode ? 'bg-accent text-white border-accent' : 'bg-white/80 text-gray-500 hover:text-accent hover:border-accent'}`}
                            >
                                <span className="material-icons-round text-sm mr-1 align-middle">tune</span>
                                Adjust
                            </button>
                        )}
                        <button
                            onClick={() => setShowGenderPick(true)}
                            className="px-3 py-1.5 rounded-full bg-white/80 backdrop-blur border text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-accent hover:border-accent transition"
                        >
                            <span className="material-icons-round text-sm mr-1 align-middle">swap_horiz</span>
                            Switch
                        </button>
                    </div>
                )}

                {isAdmin && (
                    <div className="absolute top-3 right-3 flex gap-1 z-50">
                        <button onClick={() => setZoomLevel(z => Math.min(z + 0.5, 3))} className="w-8 h-8 rounded-full bg-white/80 backdrop-blur border flex items-center justify-center text-gray-500 hover:text-accent hover:border-accent transition text-sm font-bold">+</button>
                        <button onClick={() => setZoomLevel(z => Math.max(z - 0.5, 1))} className="w-8 h-8 rounded-full bg-white/80 backdrop-blur border flex items-center justify-center text-gray-500 hover:text-accent hover:border-accent transition text-sm font-bold">−</button>
                        {zoomLevel > 1 && <button onClick={() => setZoomLevel(1)} className="px-2 h-8 rounded-full bg-white/80 backdrop-blur border flex items-center justify-center text-gray-500 hover:text-accent hover:border-accent transition text-[10px] font-bold uppercase">Reset</button>}
                    </div>
                )}

                {isAdmin && !adjustMode && (
                    <div className="absolute bottom-3 left-3 flex gap-2">
                        <button onClick={handleExportPositions} className="px-3 py-1.5 rounded-full bg-white/80 backdrop-blur border text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-accent hover:border-accent transition">
                            <span className="material-icons-round text-sm mr-1 align-middle">download</span>
                            Export
                        </button>
                        <button onClick={handleImportPositions} className="px-3 py-1.5 rounded-full bg-white/80 backdrop-blur border text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-accent hover:border-accent transition">
                            <span className="material-icons-round text-sm mr-1 align-middle">upload</span>
                            Import
                        </button>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-t-[2rem] lg:rounded-none shadow-2xl p-5 border-t lg:border-t-0 lg:border-l h-[42%] lg:h-auto lg:w-[420px] lg:flex-shrink-0 flex flex-col min-h-0">
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 lg:flex-wrap lg:overflow-visible">
                    {categories.map(cat => (
                        <button
                            key={cat.key}
                            onClick={() => setActiveCategory(cat.key)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap
                ${activeCategory === cat.key ? 'bg-accent text-white shadow-md' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}
              `}
                        >
                            <span className="material-icons-round text-sm">{cat.icon}</span>
                            {cat.label}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-4 gap-3 content-start overflow-y-auto no-scrollbar flex-1 min-h-0">
                    {filteredItems.map(item => {
                        const cost = getItemCost(item.id);
                        const isUnlocked = cost === 0 || unlockedAvatarItems.has(item.id);
                        const isSelected = getSelectedId() === item.id;

                        return (
                            <button
                                key={item.id}
                                onClick={() => handleSelectItem(item)}
                                disabled={!isUnlocked && user.points < cost}
                                className={`relative aspect-square rounded-2xl border overflow-hidden transition-all
                  ${isSelected ? 'border-2 border-accent bg-accent/10 shadow-md' : 'bg-gray-50 border-gray-200'}
                  ${!isUnlocked ? 'border-dashed border-gray-300' : ''}
                  disabled:opacity-40 disabled:cursor-not-allowed active:scale-95
                `}
                            >
                                {item.id === 'none' || item.id === 'no_face' ? (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{item.id === 'none' ? 'No Hair' : 'No Face'}</span>
                                    </div>
                                ) : (
                                    <SafeImg
                                        src={item.path}
                                        alt={item.label}
                                        className={`w-full h-full ${activeCategory === 'body' ? 'object-cover object-top' : 'object-contain'} ${!isUnlocked ? 'opacity-50' : ''}`}
                                    />
                                )}
                                {!isUnlocked && (
                                    <div className="absolute top-1 right-1 text-[8px] font-bold bg-accent/10 text-accent px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                        <span className="material-icons-round text-[9px]">stars</span>
                                        {cost}
                                    </div>
                                )}
                                {isSelected && (
                                    <div className="absolute bottom-0 inset-x-0 bg-accent/90 text-white text-[8px] font-bold text-center py-0.5">
                                        Equipped
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
            </div>

            {pendingUnlock && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-[400]">
                    <div className="bg-white rounded-2xl p-6 w-72 text-center shadow-xl">
                        <h2 className="font-bold mb-2">Unlock Item?</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            Spend <strong>{pendingUnlock.cost}</strong> points to unlock this item?
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setPendingUnlock(null)} className="flex-1 py-2 rounded-xl bg-gray-100 font-semibold text-gray-500 hover:bg-gray-200">Cancel</button>
                            <button onClick={handleUnlockConfirm} className="flex-1 py-2 rounded-xl bg-accent text-white font-semibold hover:opacity-90">Unlock</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomizationView;
