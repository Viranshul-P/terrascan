"""Check that Python, PyTorch and the GPU are set up correctly.

Run: python scripts/check_env.py
"""

import platform
import sys

import torch


def main():
    print(f"Python:         {platform.python_version()}")
    print(f"torch:          {torch.__version__}")
    print(f"CUDA available: {torch.cuda.is_available()}")

    if not torch.cuda.is_available():
        print("ERROR: CUDA is not available. Did you install the CUDA build of torch?")
        sys.exit(1)

    print(f"CUDA (torch):   {torch.version.cuda}")
    print(f"GPU:            {torch.cuda.get_device_name(0)}")

    free_bytes, total_bytes = torch.cuda.mem_get_info(0)
    print(f"VRAM free:      {free_bytes / 1024**3:.2f} GB of {total_bytes / 1024**3:.2f} GB")

    # Multiply two random matrices on the GPU and compare with the CPU result.
    torch.manual_seed(42)
    a = torch.randn(1000, 1000)
    b = torch.randn(1000, 1000)
    gpu_result = (a.cuda() @ b.cuda()).cpu()
    cpu_result = a @ b
    if not torch.allclose(gpu_result, cpu_result, atol=1e-2):
        print("ERROR: GPU matrix multiply does not match the CPU result.")
        sys.exit(1)
    print("GPU matmul:     OK (matches CPU)")


if __name__ == "__main__":
    main()
