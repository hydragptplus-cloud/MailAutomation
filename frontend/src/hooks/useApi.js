import { useState, useCallback, useEffect } from "react";
import { apiError } from "../utils/apiError";

export function useApi(apiFunc, autoFetch = true, initialParams = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState(null);

  const execute = useCallback(
    async (params = initialParams) => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFunc(params);
        setData(response.data);
        return response.data;
      } catch (err) {
        setError(apiError(err, "An unexpected error occurred."));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [apiFunc]
  );

  useEffect(() => {
    if (autoFetch) {
      execute();
    }
  }, [autoFetch]);

  return {
    data,
    setData,
    loading,
    error,
    execute,
    refetch: execute,
  };
}

export default useApi;
