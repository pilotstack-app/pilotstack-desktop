/**
 * Fix for lucide-react JSX component type compatibility issue
 * between React 18 and React 19 types
 * 
 * This declaration file extends the default ForwardRefExoticComponent
 * to include the JSX.Element return type which is compatible with React 18
 */

import { ForwardRefExoticComponent, RefAttributes, SVGProps } from "react";

declare module "lucide-react" {
  export interface LucideProps extends SVGProps<SVGSVGElement> {
    size?: string | number;
    absoluteStrokeWidth?: boolean;
  }

  // Override the icon components to use a compatible type
  type LucideIcon = ForwardRefExoticComponent<
    Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
  > & {
    displayName?: string;
  };

  // Re-export all icons with the fixed type
  export const Activity: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const AlertTriangle: LucideIcon;
  export const AppWindow: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const Check: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronLeft: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const Circle: LucideIcon;
  export const Clipboard: LucideIcon;
  export const Clock: LucideIcon;
  export const Cloud: LucideIcon;
  export const CloudOff: LucideIcon;
  export const Copy: LucideIcon;
  export const Download: LucideIcon;
  export const Edit3: LucideIcon;
  export const ExternalLink: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const Film: LucideIcon;
  export const Folder: LucideIcon;
  export const FolderOpen: LucideIcon;
  export const Gauge: LucideIcon;
  export const Ghost: LucideIcon;
  export const HardDrive: LucideIcon;
  export const ImageIcon: LucideIcon;
  export const Info: LucideIcon;
  export const Keyboard: LucideIcon;
  export const Layers: LucideIcon;
  export const Link2: LucideIcon;
  export const Link2Off: LucideIcon;
  export const Loader2: LucideIcon;
  export const LogOut: LucideIcon;
  export const Mail: LucideIcon;
  export const Minus: LucideIcon;
  export const Monitor: LucideIcon;
  export const MoreVertical: LucideIcon;
  export const Music: LucideIcon;
  export const Paintbrush: LucideIcon;
  export const Pause: LucideIcon;
  export const Play: LucideIcon;
  export const Plus: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const Rocket: LucideIcon;
  export const Save: LucideIcon;
  export const Settings: LucideIcon;
  export const Shield: LucideIcon;
  export const ShieldOff: LucideIcon;
  export const Sliders: LucideIcon;
  export const Sparkles: LucideIcon;
  export const Square: LucideIcon;
  export const Timer: LucideIcon;
  export const Trash2: LucideIcon;
  export const Upload: LucideIcon;
  export const User: LucideIcon;
  export const Video: LucideIcon;
  export const X: LucideIcon;
  export const Zap: LucideIcon;
}

