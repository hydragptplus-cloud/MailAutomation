import { useToastContext } from "../context/ToastContext";

export function useToast() {
  const { toast, removeToast, addToast } = useToastContext();
  return { toast, removeToast, addToast };
}

export default useToast;
