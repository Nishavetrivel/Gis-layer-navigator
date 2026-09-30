import React, { useEffect } from 'react';
import { AlertCircle, X, Layers, MapPin } from 'lucide-react';

export interface NoDataInfo {
  level?: string;
  name?: string;
  code?: string;
  message?: string;
  suggestion?: string;
}

interface DataNotAvailableModalProps {
  info: NoDataInfo | null;
  onClose: () => void;
}

export const DataNotAvailableModal: React.FC<DataNotAvailableModalProps> = () => {
  return null;
};
