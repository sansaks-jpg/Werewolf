#define _GNU_SOURCE
#include <sys/sysinfo.h>
#include <dlfcn.h>

int sysinfo(struct sysinfo *info) {
    int (*orig_sysinfo)(struct sysinfo *) = dlsym(RTLD_NEXT, "sysinfo");
    int ret = orig_sysinfo(info);
    if (ret == 0) {
        unsigned long fake_ram = 3ULL * 1024 * 1024 * 1024; // 3 GB
        if (info->mem_unit > 0) {
            info->totalram = fake_ram / info->mem_unit;
        } else {
            info->totalram = fake_ram;
            info->mem_unit = 1;
        }
    }
    return ret;
}
