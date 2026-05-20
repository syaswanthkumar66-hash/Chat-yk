import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { Icon, Button } from './UI';
import { motion } from 'framer-motion';
import { Html5Qrcode } from 'html5-qrcode';

export const QRScanner = ({ onScan, onClose }: { onScan: (data: string) => void, onClose: () => void }) => {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isInitializing = useRef(false);
  const scannerId = "qr-reader";

  useEffect(() => {
    let isMounted = true;

    const startScanner = async () => {
      if (isInitializing.current) return;
      isInitializing.current = true;

      try {
        // Ensure any previous instance is stopped
        if (scannerRef.current && scannerRef.current.isScanning) {
          try {
            await scannerRef.current.stop();
            scannerRef.current.clear();
          } catch(e) {}
        }

        const container = document.getElementById(scannerId);
        if (container) container.innerHTML = "";

        const html5QrCode = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCode;

        const config = { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0 
        };

        if (!isMounted) {
          isInitializing.current = false;
          return;
        }

        // Try to get all cameras to find the best one
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cameras && cameras.length > 0) {
            // Prefer back camera
            const backCamera = cameras.find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('environment'));
            const cameraId = backCamera ? backCamera.id : cameras[0].id;
            
            await html5QrCode.start(
              cameraId,
              config,
              (decodedText) => {
                if (isMounted) onScan(decodedText);
              },
              () => {}
            );
          } else {
            // Fallback to facingMode if getCameras fails or returns empty
            await html5QrCode.start(
              { facingMode: "environment" },
              config,
              (decodedText) => {
                if (isMounted) onScan(decodedText);
              },
              () => {}
            );
          }
        } catch (cameraErr) {
          // If getCameras fails, try with facingMode directly
          await html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
              if (isMounted) onScan(decodedText);
            },
            () => {}
          );
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("Error starting scanner:", err);
          if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission denied')) {
            setError("Camera access was denied. If you are viewing this in a preview window, try opening the app in a new tab, or use 'Upload from Gallery' below.");
          } else {
            setError("Could not access camera. Please ensure your device has a camera and it's not being used by another app. You can still use 'Upload from Gallery'.");
          }
        }
      } finally {
        isInitializing.current = false;
      }
    };

    // Small delay to ensure DOM is ready and previous cleanups finished
    const timeoutId = setTimeout(startScanner, 100);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      
      // Cleanup scanner
      if (scannerRef.current) {
        const scanner = scannerRef.current;
        if (scanner.isScanning) {
          scanner.stop().then(() => {
            try {
              scanner.clear();
            } catch (clearErr) {
              console.warn("Scanner clear error ignored:", clearErr);
            }
          }).catch(err => {
            // Check if error is due to node removal we can safely ignore
            if (err?.message?.includes('removeChild')) {
              console.warn("Scanner stop removeChild error ignored.");
            } else {
              console.error("Error cleaning up scanner:", err);
            }
          });
        }
      }
    };
  }, []);

  // We don't need a separate stopScanner function inside the effect anymore
  // as the cleanup handles it.

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const html5QrCode = new Html5Qrcode(scannerId);
      const result = await html5QrCode.scanFile(file, true);
      onScan(result);
    } catch (err) {
      console.error("Error scanning file:", err);
      setError("No QR code found in this image.");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black"
    >
      {/* The Scanner Element - Background */}
      <div 
        id={scannerId} 
        className="absolute inset-0 z-0" 
      />

      {/* UI Overlay */}
      <div className="relative z-10 h-full flex flex-col pointer-events-none">
        <header className="p-6 flex items-center justify-between text-white pointer-events-auto">
          <button onClick={onClose} className="size-10 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-md border border-white/10">
            <Icon name="close" />
          </button>
          <h3 className="font-black uppercase italic tracking-tighter drop-shadow-lg">Scan QR Code</h3>
          <div className="size-10" />
        </header>

        <main className="flex-1 flex flex-col items-center justify-center relative">
          <div className="relative size-64">
            {/* Corners */}
            <div className="absolute top-0 left-0 size-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
            <div className="absolute top-0 right-0 size-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 size-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 size-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
            
            {/* Scanning Line */}
            <motion.div 
              animate={{ top: ['0%', '100%', '0%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="absolute left-0 right-0 h-1 bg-primary/50 shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)] z-10"
            />
          </div>

          <div className="text-center space-y-2 px-6 mt-8">
            <p className="text-white font-bold drop-shadow-lg">Align QR code within the frame</p>
            <p className="text-white/70 text-xs drop-shadow-lg">Scanning will start automatically</p>
            {error && (
              <div className="space-y-4 mt-4">
                <p className="text-red-400 text-xs font-bold bg-black/60 px-4 py-2 rounded-full backdrop-blur-md border border-red-500/20">
                  {error}
                </p>
                <div className="flex flex-col gap-2">
                  <Button 
                    variant="outline" 
                    className="text-white border-white/20 hover:bg-white/10 backdrop-blur-md bg-black/20"
                    onClick={() => {
                      setError(null);
                      // Re-trigger the startScanner logic
                      const retryScanner = async () => {
                        if (isInitializing.current) return;
                        isInitializing.current = true;
                        try {
                          if (scannerRef.current && scannerRef.current.isScanning) {
                             await scannerRef.current.stop().catch(() => {});
                             try { scannerRef.current.clear(); } catch(e) {}
                          }
                          const container = document.getElementById(scannerId);
                          if (container) container.innerHTML = "";

                          const html5QrCode = new Html5Qrcode(scannerId);
                          scannerRef.current = html5QrCode;
                          await html5QrCode.start(
                            { facingMode: "environment" },
                            { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
                            (decodedText) => onScan(decodedText),
                            () => {}
                          );
                        } catch (err: any) {
                          console.error("Retry error:", err);
                          setError(err?.name === 'NotAllowedError' ? "Permission still denied. Try opening in a new tab if you are in a preview." : "Failed to start camera.");
                        } finally {
                          isInitializing.current = false;
                        }
                      };
                      retryScanner();
                    }}
                  >
                    <Icon name="refresh" />
                    Try Again
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>

        <footer className="p-12 flex flex-col gap-4 pointer-events-auto">
          <input 
            type="file" 
            id="qr-file-input" 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileUpload} 
          />
          <Button 
            variant="outline" 
            className="text-white border-white/20 hover:bg-white/10 backdrop-blur-md bg-black/20"
            onClick={() => document.getElementById('qr-file-input')?.click()}
          >
            <Icon name="image" />
            Upload from Gallery
          </Button>
          <div className="flex justify-center">
            <div className="bg-black/40 px-4 py-2 rounded-full flex items-center gap-2 backdrop-blur-md border border-white/10">
              <div className="size-2 rounded-full bg-primary animate-pulse" />
              <span className="text-white text-[10px] font-bold uppercase tracking-widest">Camera Active</span>
            </div>
          </div>
        </footer>
      </div>
    </motion.div>
  );
};
