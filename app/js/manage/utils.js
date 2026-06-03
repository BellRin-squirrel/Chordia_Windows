window.ManageUtils = {
    // ★修正: ダブルクォーテーションやシングルクォーテーションも確実にエスケープする
    escapeHtml: function(text) {
        if (text === null || text === undefined) return '';
        return String(text).replace(/[&<>"']/g, function(match) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    },
    showToast: function(msg, isErr) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = 'toast show';
        if (isErr) toast.classList.add('error'); else toast.classList.add('success');
        setTimeout(() => toast.classList.remove('show'), 3000);
    },
    formatTime: function(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    },
    updateSeekColor: function(p) {
        const seekBar = document.getElementById('seekBar');
        if(seekBar) seekBar.style.background = `linear-gradient(to right, #4f46e5 ${p}%, #e5e7eb ${p}%)`;
    }
};