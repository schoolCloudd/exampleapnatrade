import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

interface BackgroundMusicProps {
  autoPlay?: boolean;
}

const BackgroundMusic = ({ autoPlay = true }: BackgroundMusicProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControl, setShowControl] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0, buttonX: 0, buttonY: 0 });
  const DRAG_THRESHOLD = 10; // Pixels moved before considering it a drag

  // Load saved position from localStorage
  useEffect(() => {
    const savedPosition = localStorage.getItem('musicButtonPosition');
    if (savedPosition) {
      try {
        const parsed = JSON.parse(savedPosition);
        setPosition(parsed);
      } catch {
        // Default position (bottom right)
        setPosition({ x: window.innerWidth - 60, y: window.innerHeight - 120 });
      }
    } else {
      // Default position (bottom right)
      setPosition({ x: window.innerWidth - 60, y: window.innerHeight - 120 });
    }
  }, []);

  useEffect(() => {
    // Check if user previously set music preference
    const savedMusicState = localStorage.getItem('backgroundMusicEnabled');
    const shouldPlay = savedMusicState !== 'false';

    // Create audio element
    const audio = new Audio('/audio/background-music.mp3');
    audio.loop = true;
    audio.volume = 0.3;
    audioRef.current = audio;

    // Handle autoplay with user interaction detection
    const handleFirstInteraction = () => {
      if (!hasInteracted && shouldPlay && autoPlay) {
        audio.play().then(() => {
          setIsPlaying(true);
          setHasInteracted(true);
        }).catch(() => {
          // Autoplay blocked, will need user to click
          setShowControl(true);
        });
      }
      // Remove listeners after first interaction
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };

    // Try to autoplay immediately (works in some browsers)
    if (shouldPlay && autoPlay) {
      audio.play().then(() => {
        setIsPlaying(true);
        setHasInteracted(true);
      }).catch(() => {
        // Autoplay was prevented, wait for user interaction
        setShowControl(true);
        document.addEventListener('click', handleFirstInteraction);
        document.addEventListener('touchstart', handleFirstInteraction);
        document.addEventListener('keydown', handleFirstInteraction);
      });
    }

    // Show control after a delay
    setTimeout(() => setShowControl(true), 2000);

    return () => {
      audio.pause();
      audio.src = '';
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [autoPlay, hasInteracted]);

  const toggleMusic = () => {
    // Don't toggle if user actually moved the button
    if (hasMoved) return;
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      localStorage.setItem('backgroundMusicEnabled', 'false');
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        localStorage.setItem('backgroundMusicEnabled', 'true');
      }).catch(console.error);
    }
  };

  // Dragging handlers
  const handleDragStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    setHasMoved(false); // Reset move state on new drag start
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      buttonX: position.x,
      buttonY: position.y,
    };
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;

    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;
    
    // Check if moved beyond threshold
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > DRAG_THRESHOLD) {
      setHasMoved(true);
    }

    const newX = Math.max(0, Math.min(window.innerWidth - 48, dragStartRef.current.buttonX + deltaX));
    const newY = Math.max(0, Math.min(window.innerHeight - 48, dragStartRef.current.buttonY + deltaY));

    setPosition({ x: newX, y: newY });
  };

  const handleDragEnd = () => {
    if (isDragging && hasMoved) {
      // Only save position if actually moved
      localStorage.setItem('musicButtonPosition', JSON.stringify(position));
    }
    // Reset dragging state after a short delay
    setTimeout(() => {
      setIsDragging(false);
      setHasMoved(false);
    }, 50);
  };

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleDragMove(touch.clientX, touch.clientY);
  };

  // Add global event listeners for mouse move and up
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      handleDragEnd();
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, position]);

  if (!showControl) return null;

  return (
    <button
      ref={buttonRef}
      onClick={toggleMusic}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleDragEnd}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      className="fixed z-50 p-3 rounded-full glass-card shadow-lg hover:scale-110 transition-all duration-200 touch-manipulation select-none"
      aria-label={isPlaying ? "Mute music" : "Play music"}
    >
      {isPlaying ? (
        <Volume2 size={20} className="text-primary animate-pulse" />
      ) : (
        <VolumeX size={20} className="text-muted-foreground" />
      )}
    </button>
  );
};

export default BackgroundMusic;
