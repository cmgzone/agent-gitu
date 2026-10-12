/* Add a non-removable filter to every quota-scoped process. Docker's own
 * seccomp policy remains in force. Both the desktop and docker-exec tools
 * enter here, so file owners cannot unset project inheritance or change IDs.
 */
#include <errno.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/fs.h>
#include <linux/seccomp.h>

#if defined(__x86_64__)
#define GITU_ARCH AUDIT_ARCH_X86_64
#elif defined(__aarch64__)
#define GITU_ARCH AUDIT_ARCH_AARCH64
#else
#error Private desktop quota guard supports AMD64 and ARM64.
#endif

int main(int argc, char **argv) {
  if (argc < 2) { fputs("Quota guard needs a program.\n", stderr); return 125; }
  if (getenv("GITU_DISK_LIMIT_MB")) {
    struct sock_filter rules[] = {
      BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
      BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, GITU_ARCH, 1, 0),
      BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
      BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
      /* Reject the x32 ABI rather than allowing alternate syscall numbers. */
      BPF_JUMP(BPF_JMP | BPF_JGE | BPF_K, 0x40000000U, 0, 1),
      BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | ENOSYS),
      /* file_setattr is syscall 469 on both supported Linux architectures. */
      BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, 469, 0, 1),
      BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM),
      BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_io_uring_setup, 0, 1),
      BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM),
      BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_ioctl, 0, 4),
      BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[1])),
      BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, FS_IOC_FSSETXATTR, 3, 0),
      BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, _IOC(_IOC_WRITE, 'f', 2, 8), 2, 0),
      BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, _IOC(_IOC_WRITE, 'f', 2, 4), 1, 0),
      BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
      BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM),
    };
    struct sock_fprog filter = { .len = sizeof(rules) / sizeof(rules[0]), .filter = rules };
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) || prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &filter)) {
      perror("Private computer quota guard unavailable"); return 125;
    }
  }
  execvp(argv[1], &argv[1]); perror("Private computer program unavailable"); return 125;
}
