/**
 * Player de Vídeo Tizen AVPlay com Fallback
 * Suporta streaming nativo de hardware RTSP (H.264 / H.265) via webapis.avplay
 * nas TVs Samsung Smart TV, e fallback automático para streaming JPEG em navegadores de teste.
 */
class TvStreamPlayer {
    constructor(containerElement, dvrClient) {
        this.container = containerElement;
        this.dvrClient = dvrClient;
        this.isAvPlayAvailable = (typeof window.webapis !== 'undefined' && typeof window.webapis.avplay !== 'undefined');
        this.currentChannelId = null;
        this.currentStreamType = 2; // 2 = Sub-stream Fluido (padrão 15-25 FPS), 1 = Main (1080P)
        this.isPlaying = false;
        this.fallbackTimer = null;
        this.fallbackImg = null;

        console.log('[Player] Samsung AVPlay disponível?', this.isAvPlayAvailable ? 'SIM' : 'NÃO (Modo Fallback Snapshot)');
        this.initDOM();
    }

    initDOM() {
        this.fallbackImg = document.createElement('img');
        this.fallbackImg.className = 'avplay-fallback-img';
        this.fallbackImg.style.display = 'none';
        this.fallbackImg.alt = 'Stream Fallback';
        this.container.appendChild(this.fallbackImg);
    }

    /**
     * Inicia a reprodução de um canal
     */
    async play(channelId, streamType = 2) {
        this.stop();
        this.currentChannelId = channelId;
        this.currentStreamType = streamType;
        this.isPlaying = true;

        if (this.isAvPlayAvailable) {
            this.playAvPlay(channelId, streamType);
        } else {
            this.playFallback(channelId, streamType);
        }
    }

    /**
     * Reprodução nativa via Samsung AVPlay (Hardware RTSP)
     */
    playAvPlay(channelId, streamType) {
        try {
            const rtspUrl = this.dvrClient.getRtspUrl(channelId, streamType);
            console.log('[AVPlay] Abrindo stream RTSP:', rtspUrl);

            window.webapis.avplay.open(rtspUrl);

            // Ajusta o retângulo de exibição para preencher o contêiner na resolução 1920x1080
            const rect = this.container.getBoundingClientRect();
            const x = Math.round(rect.left);
            const y = Math.round(rect.top);
            const w = Math.round(rect.width);
            const h = Math.round(rect.height);

            window.webapis.avplay.setDisplayRect(x, y, w, h);
            try {
                window.webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
            } catch (dmErr) {
                console.warn('[AVPlay] setDisplayMethod:', dmErr);
            }

            window.webapis.avplay.setListener({
                onbufferingstart: () => {
                    console.log('[AVPlay] Buffering iniciado...');
                    this.onBuffering(true);
                },
                onbufferingcomplete: () => {
                    console.log('[AVPlay] Buffering completo.');
                    this.onBuffering(false);
                },
                onerror: (err) => {
                    console.error('[AVPlay] Erro no player:', err);
                    this.onBuffering(false);
                    // Em caso de falha de codec ou rede, tenta o fallback
                    this.playFallback(channelId, streamType);
                }
            });

            window.webapis.avplay.prepareAsync(() => {
                console.log('[AVPlay] PrepareAsync pronto. Iniciando playback...');
                window.webapis.avplay.play();
                this.onBuffering(false);
            }, (prepareErr) => {
                console.warn('[AVPlay] Falha no prepareAsync:', prepareErr);
                this.playFallback(channelId, streamType);
            });

        } catch (e) {
            console.error('[AVPlay] Exceção ao iniciar AVPlay:', e);
            this.playFallback(channelId, streamType);
        }
    }

    /**
     * Fallback de vídeo de alta taxa via snapshots periódicos
     */
    async playFallback(channelId, streamType) {
        console.log('[Player] Executando streaming contínuo sem pausas (Taxa de 10ms)');
        this.fallbackImg.src = this.dvrClient.getSnapshotUrl(channelId, streamType);
        this.fallbackImg.style.display = 'block';

        let lastBlobUrl = null;
        let isFetching = false;

        const updateFrame = async () => {
            if (!this.isPlaying || this.currentChannelId !== channelId || isFetching) return;
            isFetching = true;

            try {
                const newBlobUrl = await this.dvrClient.fetchSnapshotBlob(channelId, streamType);
                if (this.isPlaying && this.currentChannelId === channelId) {
                    this.fallbackImg.src = newBlobUrl;
                    if (lastBlobUrl) {
                        URL.revokeObjectURL(lastBlobUrl);
                    }
                    lastBlobUrl = newBlobUrl;
                } else {
                    URL.revokeObjectURL(newBlobUrl);
                }
            } catch (err) {
                // Erro de snapshot temporário
            } finally {
                isFetching = false;
            }

            if (this.isPlaying && this.currentChannelId === channelId) {
                // Taxa de quadros contínua (10ms)
                this.fallbackTimer = setTimeout(updateFrame, 10);
            }
        };

        updateFrame();
    }

    /**
     * Interrompe a reprodução atual
     */
    stop() {
        this.isPlaying = false;
        if (this.fallbackTimer) {
            clearTimeout(this.fallbackTimer);
            this.fallbackTimer = null;
        }

        if (this.fallbackImg) {
            this.fallbackImg.style.display = 'none';
            this.fallbackImg.src = '';
        }

        if (this.isAvPlayAvailable) {
            try {
                const state = window.webapis.avplay.getState();
                if (state === 'PLAYING' || state === 'PAUSED' || state === 'READY') {
                    window.webapis.avplay.stop();
                }
                window.webapis.avplay.close();
            } catch (e) {
                console.warn('[AVPlay] Erro ao parar AVPlay:', e);
            }
        }
    }

    onBuffering(isBuffering) {
        const loader = document.getElementById('player-loader');
        if (loader) {
            loader.style.display = isBuffering ? 'flex' : 'none';
        }
    }

    /**
     * Redimensiona o retângulo de exibição do AVPlay quando a tela muda
     */
    resize() {
        if (!this.isPlaying || !this.isAvPlayAvailable) return;
        try {
            const rect = this.container.getBoundingClientRect();
            window.webapis.avplay.setDisplayRect(
                Math.round(rect.left),
                Math.round(rect.top),
                Math.round(rect.width),
                Math.round(rect.height)
            );
            try {
                window.webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
            } catch (e2) {}
        } catch (e) {
            console.warn('[AVPlay] Erro ao redimensionar:', e);
        }
    }
}

window.TvStreamPlayer = TvStreamPlayer;
