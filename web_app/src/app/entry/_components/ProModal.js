import { Check, TrendingUp, X } from 'lucide-react';

export default function ProModal({ showProModal, setShowProModal }) {
    if (!showProModal) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all animate-in fade-in zoom-in duration-300">
                <div className="bg-gradient-to-br from-[#0d7ff2] to-blue-700 p-8 text-white text-center relative">
                    <button
                        onClick={() => setShowProModal(false)}
                        className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                    <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/30">
                        <TrendingUp size={32} className="text-white" />
                    </div>
                    <h3 className="text-2xl font-black mb-2">포트폴리오 확장이 필요한 시점!</h3>
                    <p className="text-blue-100 text-sm leading-relaxed">
                        이미 정성스럽게 5개의 자산을 관리하고 계시네요.<br />
                        더 넓은 자산의 바다로 나아갈 준비가 되셨습니다.
                    </p>
                </div>
                <div className="p-8">
                    <ul className="space-y-4 mb-8">
                        <li className="flex items-start gap-3">
                            <div className="p-1 bg-green-100 rounded-full mt-0.5">
                                <Check size={14} className="text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-900">무제한 자산 등록</p>
                                <p className="text-xs text-slate-500">갯수 제한 없이 모든 포트폴리오를 관리하세요.</p>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <div className="p-1 bg-blue-100 rounded-full mt-0.5">
                                <Check size={14} className="text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-900">안전한 실시간 클라우드 백업</p>
                                <p className="text-xs text-slate-500">핸드폰을 바꿔도, 브라우저를 초기화해도 데이터는 영원히 안전합니다.</p>
                            </div>
                        </li>
                    </ul>
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => {
                                alert("결제 및 로그인 시스템 도입 준비 중입니다! (Phase 2에서 구현 예정)");
                                setShowProModal(false);
                            }}
                            className="w-full py-4 bg-[#0d7ff2] hover:bg-blue-600 text-white font-black rounded-xl shadow-lg shadow-blue-200 transition-all transform active:scale-[0.98]"
                        >
                            지금 Pro로 업그레이드 (한달 무료)
                        </button>
                        <button
                            onClick={() => setShowProModal(false)}
                            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold rounded-xl transition-colors text-sm"
                        >
                            다음에 할게요
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-400 text-center mt-6 uppercase tracking-widest font-medium">
                        Data Insurance for your Wealth
                    </p>
                </div>
            </div>
        </div>
    );
}
