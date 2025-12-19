
import React, { useState, useRef, useEffect, useCallback } from 'react';
// Added 'Layers' to the imports from lucide-react
import { Camera, RefreshCw, Download, Image as ImageIcon, Sparkles, AlertCircle, Loader2, Users, Plus, X, Square, Monitor, Smartphone, BrainCircuit, Key, Zap, ShieldCheck, Shuffle, CheckCircle2, CreditCard, ChevronRight, Lock, Unlock, ArrowRight, Layers } from 'lucide-react';
import { getRandomScenarios, MOVIE_SCENARIOS_POOL } from './constants';
import { GeneratedImage, Scenario } from './types';
import { generateMovieSetSelfie, analyzeCharacterFeatures } from './services/geminiService';

type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
type ModelTier = "standard" | "pro";

const compressImage = (base64Str: string, maxWidth = 1024, maxHeight = 1024): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context'));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
  });
};

const App: React.FC = () => {
  const [modelTier, setModelTier] = useState<ModelTier>("pro");
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [sourceImages, setSourceImages] = useState<string[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedScenarios, setSelectedScenarios] = useState<Scenario[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [characterDesc, setCharacterDesc] = useState("");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(selected);
      setIsInitialized(true);
    };
    checkKey();
    refreshScenarios();
  }, []);

  const handleSelectKey = async () => {
    // @ts-ignore
    await window.aistudio.openSelectKey();
    setHasApiKey(true);
    setGlobalError(null);
    setShowKeyPanel(false);
  };

  const refreshScenarios = useCallback(() => {
    setSelectedScenarios(getRandomScenarios(9));
    setGeneratedImages([]); 
  }, []);

  const swapSingleScenario = (index: number) => {
    const availablePool = MOVIE_SCENARIOS_POOL.filter(s => !selectedScenarios.some(curr => curr.movieTitle === s.movieTitle));
    if (availablePool.length === 0) return;
    const newScenario = availablePool[Math.floor(Math.random() * availablePool.length)];
    setSelectedScenarios(prev => {
      const next = [...prev];
      next[index] = newScenario;
      return next;
    });
    if (generatedImages[index]) {
      setGeneratedImages(prev => prev.map((img, i) => i === index ? { ...img, status: 'pending', url: '' } : img));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setGlobalError(null);
      const remainingSlots = 2 - sourceImages.length;
      Array.from(files).slice(0, remainingSlots).forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const compressed = await compressImage(reader.result as string);
          setSourceImages(prev => [...prev, compressed].slice(0, 2));
        };
        reader.readAsDataURL(file);
      });
    }
  };

  useEffect(() => {
    if (sourceImages.length > 0) {
      setIsAnalyzing(true);
      analyzeCharacterFeatures(sourceImages)
        .then(desc => setCharacterDesc(desc))
        .finally(() => setIsAnalyzing(false));
    }
  }, [sourceImages]);

  const startGeneration = async () => {
    if (sourceImages.length === 0) return;
    if (!hasApiKey) {
      setShowKeyPanel(true);
      return;
    }

    setIsGenerating(true);
    setGlobalError(null);

    const placeholders: GeneratedImage[] = selectedScenarios.map((s, i) => ({
      id: `img-${Date.now()}-${i}`,
      url: '',
      prompt: s.description,
      status: 'loading',
      scenario: s.movieTitle,
      movieTitle: s.movieTitle,
      actor: s.actor
    }));
    setGeneratedImages(placeholders);

    selectedScenarios.forEach(async (scenario, index) => {
      try {
        const resultUrl = await generateMovieSetSelfie(sourceImages, scenario, aspectRatio, characterDesc, modelTier);
        setGeneratedImages(prev => prev.map((img, i) => 
          i === index ? { ...img, url: resultUrl, status: 'completed' } : img
        ));
      } catch (err: any) {
        setGeneratedImages(prev => prev.map((img, i) => 
          i === index ? { ...img, status: 'error' } : img
        ));
        if (err.message === "AUTH_REQUIRED" || err.message?.includes("Requested entity was not found") || err.message?.includes("PERMISSION_DENIED")) {
          setHasApiKey(false);
          setGlobalError("当前授权已过期或余额不足，请重新点击“秘钥授权框”进行连接。");
        }
      }
    });

    setIsGenerating(false);
  };

  const redrawImage = async (index: number) => {
    const scenario = selectedScenarios[index];
    setGeneratedImages(prev => prev.map((img, i) => i === index ? { ...img, status: 'loading' } : img));
    try {
      const resultUrl = await generateMovieSetSelfie(sourceImages, scenario, aspectRatio, characterDesc, modelTier);
      setGeneratedImages(prev => prev.map((img, i) => i === index ? { ...img, url: resultUrl, status: 'completed' } : img));
    } catch (err) {
      setGeneratedImages(prev => prev.map((img, i) => i === index ? { ...img, status: 'error' } : img));
    }
  };

  const downloadAll = () => {
    generatedImages.forEach((img, idx) => {
      if (img.status === 'completed' && img.url) {
        const link = document.createElement('a');
        link.href = img.url;
        link.download = `探班秀-${img.movieTitle}-${idx + 1}.png`;
        setTimeout(() => link.click(), idx * 300);
      }
    });
  };

  if (!isInitialized) return null;

  // 秘钥门禁界面
  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(245,158,11,0.05),transparent)] pointer-events-none" />
        <div className="max-w-xl w-full text-center space-y-12 animate-in fade-in zoom-in duration-700">
          <div className="space-y-4">
            <div className="mx-auto w-24 h-24 bg-gradient-to-br from-amber-400 to-orange-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-orange-500/20">
              <Lock className="w-10 h-10 text-slate-950" />
            </div>
            <h1 className="text-5xl font-black italic tracking-tighter">探班秀 AI <span className="text-amber-500 underline decoration-orange-500/30">授权中心</span></h1>
            <p className="text-slate-400 text-lg">为了保证生成画质的一致性与稳定性，本应用需先连接 API 秘钥方可进入。</p>
          </div>

          <div className="space-y-6">
            <div 
              onClick={handleSelectKey}
              className="w-full bg-slate-900/50 border-2 border-slate-800 p-8 rounded-[2rem] hover:border-amber-500/50 hover:bg-slate-900 transition-all group cursor-pointer text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="bg-amber-500/10 p-4 rounded-2xl text-amber-500">
                    <Key className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">API 秘钥填写/授权方框</h3>
                    <p className="text-slate-500 text-sm mt-1">点击此处打开授权面板，可使用您的 Key 或他人分享的额度</p>
                  </div>
                </div>
                <ArrowRight className="w-6 h-6 text-slate-700 group-hover:translate-x-2 transition-transform" />
              </div>
            </div>
            
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em]">Cinematic Simulation Engine • Restricted Access</p>
          </div>

          <div className="flex gap-4 justify-center">
             <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-xs font-bold text-slate-600 hover:text-amber-500 transition-colors flex items-center gap-2">
               <CreditCard className="w-3.5 h-3.5" /> 计费文档
             </a>
             <div className="w-1 h-1 rounded-full bg-slate-800 self-center" />
             <span className="text-xs font-bold text-slate-600">Secure Protocol v2.5</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col selection:bg-amber-500/30">
      {/* 密钥中心面板 Overlay */}
      {showKeyPanel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden">
            <div className="p-8 space-y-6">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black italic flex items-center gap-2 text-amber-500">秘钥管理</h3>
                  <p className="text-slate-500 text-xs">替换或保存您的 API 额度授权</p>
                </div>
                <button onClick={() => setShowKeyPanel(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">API 秘钥输入/替换方框</label>
                <div 
                  onClick={handleSelectKey}
                  className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl p-5 cursor-pointer hover:border-amber-500/50 transition-all group flex items-center justify-between shadow-inner"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
                      <Unlock className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">已授权: 官方项目密钥</p>
                      <p className="text-[10px] text-slate-600 mt-1">点击此处可随时替换为其他 Key 项目</p>
                    </div>
                  </div>
                  <RefreshCw className="w-5 h-5 text-slate-700 group-hover:rotate-180 transition-transform duration-500" />
                </div>
              </div>

              <button onClick={() => setShowKeyPanel(false)} className="w-full py-4 bg-amber-500 text-slate-950 font-black rounded-2xl transition-all">返回创作</button>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-amber-400 to-orange-600 p-2 rounded-xl">
            <Camera className="w-6 h-6 text-slate-950" />
          </div>
          <h1 className="text-xl font-black italic tracking-tighter hidden sm:block">探班秀 AI <span className="text-amber-500 font-bold ml-2 text-xs uppercase tracking-[0.3em]">PRO</span></h1>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="bg-slate-950 border border-slate-800 p-1 rounded-full flex">
            <button onClick={() => setModelTier('standard')} className={`px-4 py-1.5 rounded-full text-[10px] font-bold transition-all ${modelTier === 'standard' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-slate-500'}`}>标准引擎</button>
            <button onClick={() => setModelTier('pro')} className={`px-4 py-1.5 rounded-full text-[10px] font-bold transition-all ${modelTier === 'pro' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-slate-500'}`}>专业引擎</button>
          </div>
          <button onClick={() => setShowKeyPanel(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-full border border-slate-700 transition-all text-xs font-bold text-amber-500">
            <Key className="w-4 h-4" />
            <span className="hidden md:inline">管理秘钥</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 space-y-8">
        {globalError && (
          <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-2xl flex items-center gap-3 text-red-200 text-xs font-bold animate-pulse">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="flex-1">{globalError}</p>
            <button onClick={() => setShowKeyPanel(true)} className="underline font-black">点击重置秘钥</button>
          </div>
        )}

        <section className="bg-slate-900/50 border border-slate-800 rounded-[3rem] p-8 grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="space-y-8">
            <div className="space-y-2">
              <h2 className="text-4xl font-black italic">视觉实验室</h2>
              <p className="text-slate-500 text-[10px] uppercase font-bold tracking-[0.3em]">Cinematic Face Reconstruction Engine</p>
            </div>

            <div className="flex gap-4">
              {[0, 1].map((i) => (
                <div key={i} className="relative">
                  {sourceImages[i] ? (
                    <div className="relative w-40 h-40">
                      <img src={sourceImages[i]} className="w-full h-full object-cover rounded-[2.5rem] border-2 border-slate-800 shadow-2xl" alt="" />
                      <button onClick={() => setSourceImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 bg-red-500 p-2 rounded-full shadow-lg hover:scale-110 transition-transform"><X className="w-3.5 h-3.5 text-white" /></button>
                    </div>
                  ) : (
                    <div onClick={() => fileInputRef.current?.click()} className="w-40 h-40 border-2 border-dashed border-slate-800 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-amber-500/30 transition-all bg-slate-950/20 group">
                      <Plus className="w-8 h-8 text-slate-700 group-hover:text-amber-500 transition-colors" />
                      <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">导入核心人脸</span>
                    </div>
                  )}
                </div>
              ))}
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" multiple />
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <BrainCircuit className={`w-4 h-4 ${isAnalyzing ? 'animate-spin text-amber-500' : 'text-amber-500'}`} />
                特征一致性协议
              </label>
              <textarea 
                value={characterDesc}
                onChange={(e) => setCharacterDesc(e.target.value)}
                placeholder="上传面部照片后，AI将分析骨相与辨识度点..."
                className="w-full bg-slate-950 border border-slate-800 rounded-3xl p-6 text-xs font-mono text-amber-500/50 outline-none h-28 focus:border-amber-500/30 transition-all resize-none shadow-inner"
              />
            </div>
          </div>

          <div className="bg-slate-950/40 p-8 rounded-[3.5rem] border border-slate-800 flex flex-col justify-between">
            <div className="space-y-8">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">全幅/电影比例设定</label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { id: '1:1', icon: Square, label: '1:1' },
                    { id: '16:9', icon: Monitor, label: '16:9' },
                    { id: '9:16', icon: Smartphone, label: '9:16' },
                    { id: '4:3', icon: Layers, label: '4:3' },
                    { id: '3:4', icon: Smartphone, label: '3:4' }
                  ].map((ratio) => (
                    <button
                      key={ratio.id}
                      onClick={() => setAspectRatio(ratio.id as AspectRatio)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all ${aspectRatio === ratio.id ? 'bg-amber-500/10 border-amber-500 text-amber-500 shadow-xl' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                    >
                      <ratio.icon className="w-4 h-4" />
                      <span className="text-[9px] font-black">{ratio.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={refreshScenarios}
                  className="flex items-center justify-center gap-2 py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl text-[11px] font-black transition-all uppercase tracking-widest"
                >
                  <Shuffle className="w-4 h-4 text-amber-500" />
                  随机换 9 组
                </button>
                <button 
                  onClick={downloadAll}
                  disabled={!generatedImages.some(img => img.status === 'completed')}
                  className="flex items-center justify-center gap-2 py-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-500 rounded-2xl text-[11px] font-black transition-all uppercase tracking-widest disabled:opacity-20"
                >
                  <Download className="w-4 h-4" />
                  批量下载
                </button>
              </div>
            </div>

            <button 
              onClick={startGeneration}
              disabled={isGenerating || sourceImages.length === 0 || isAnalyzing}
              className={`w-full flex items-center justify-center gap-4 py-8 rounded-[2.5rem] font-black text-3xl shadow-2xl transition-all active:scale-95 disabled:grayscale mt-8 ${hasApiKey ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 shadow-orange-500/20' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}
            >
              {isGenerating ? <><Loader2 className="w-10 h-10 animate-spin" /><span>合成中...</span></> : <><Sparkles className="w-10 h-10" /><span>一键探班(9图)</span></>}
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-32">
          {selectedScenarios.map((scenario, index) => {
            const img = generatedImages[index];
            const ratioClass = {
              '1:1': 'aspect-square',
              '16:9': 'aspect-video',
              '9:16': 'aspect-[9/16]',
              '4:3': 'aspect-[4/3]',
              '3:4': 'aspect-[3/4]'
            }[aspectRatio];

            return (
              <div key={index} className={`group relative bg-slate-900 border border-slate-800 rounded-[3rem] overflow-hidden flex flex-col shadow-2xl transition-all hover:border-slate-600 ${ratioClass}`}>
                <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                  {img?.status === 'loading' && (
                    <div className="absolute inset-0 z-20 bg-slate-950/95 flex flex-col items-center justify-center gap-4 backdrop-blur-xl">
                      <div className="w-16 h-16 border-4 border-amber-500/10 rounded-full border-t-amber-500 animate-spin" />
                      <div className="text-center">
                        <p className="text-[10px] text-amber-500 font-black tracking-[0.4em] uppercase mb-1">Rendering Scene</p>
                        <p className="text-lg font-black italic">《{scenario.movieTitle}》</p>
                      </div>
                    </div>
                  )}
                  {img?.status === 'completed' ? (
                    <img src={img.url} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" alt="" />
                  ) : img?.status === 'error' ? (
                    <div className="p-8 text-center space-y-4">
                      <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
                      <div className="flex gap-2 justify-center">
                         <button onClick={() => redrawImage(index)} className="px-6 py-2 bg-slate-800 rounded-xl text-xs font-bold hover:bg-slate-700">重试</button>
                         <button onClick={() => swapSingleScenario(index)} className="px-6 py-2 bg-slate-800 rounded-xl text-xs font-bold hover:bg-slate-700">换场</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-6 opacity-10 group-hover:opacity-40 transition-all">
                      <ImageIcon className="w-20 h-20" />
                      <button onClick={() => swapSingleScenario(index)} className="p-4 bg-slate-800 rounded-full hover:bg-amber-500 hover:text-slate-950 transition-all shadow-xl">
                        <Shuffle className="w-6 h-6" />
                      </button>
                    </div>
                  )}
                  {img?.status === 'completed' && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all flex items-end justify-center p-8 gap-3">
                      <button onClick={() => redrawImage(index)} className="p-4 bg-white/10 backdrop-blur-2xl rounded-2xl hover:bg-white/20 transition-transform active:scale-90" title="重绘本场"><RefreshCw className="w-6 h-6" /></button>
                      <button onClick={() => swapSingleScenario(index)} className="p-4 bg-white/10 backdrop-blur-2xl rounded-2xl hover:bg-white/20 transition-transform active:scale-90" title="更换剧组"><Shuffle className="w-6 h-6 text-amber-500" /></button>
                      <button onClick={() => {
                        const link = document.createElement('a'); link.href = img.url; link.download = `探班秀-${img.movieTitle}.png`; link.click();
                      }} className="flex-1 p-4 bg-amber-500 text-slate-950 font-black rounded-2xl flex items-center justify-center gap-3 text-sm hover:bg-amber-400 active:scale-95 transition-all shadow-xl shadow-amber-500/20"><Download className="w-6 h-6" /> 下载</button>
                    </div>
                  )}
                </div>
                <div className="p-7 bg-slate-900 border-t border-slate-800 flex justify-between items-center">
                  <div className="space-y-1">
                    <h3 className="text-3xl font-black italic truncate max-w-[200px] text-white">《{scenario.movieTitle}》</h3>
                    <p className="text-[11px] text-slate-500 font-bold flex items-center gap-2 uppercase tracking-widest"><Users className="w-4 h-4 text-amber-500" /> {scenario.actor}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                     <span className="text-[9px] font-black px-2 py-1 border border-slate-800 rounded-lg bg-slate-950 text-slate-600 uppercase">
                       {modelTier === 'pro' ? 'Ultra' : 'Std'}
                     </span>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </main>

      <footer className="py-20 text-center border-t border-slate-900 bg-slate-950 flex flex-col items-center gap-6">
        <div className="flex gap-4 opacity-10">
          <Sparkles className="w-4 h-4" /><Sparkles className="w-4 h-4" /><Sparkles className="w-4 h-4" />
        </div>
        <p className="text-[10px] font-mono tracking-[0.8em] uppercase text-slate-700">Cinematic Intelligence Engine v2.5.9 • Deep Consistency Protocol</p>
      </footer>
    </div>
  );
};

export default App;
