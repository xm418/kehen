import subprocess, sys, time

sdk_root = r'D:\Android\Sdk'
sdkmanager = rf'{sdk_root}\cmdline-tools\latest\bin\sdkmanager.bat'

# First accept licenses
print("Accepting licenses...")
proc = subprocess.Popen(
    ['cmd', '/c', f'echo y | echo y | echo y | echo y | echo y | echo y | echo y | echo y | "{sdkmanager}" --licenses --sdk_root={sdk_root}'],
    creationflags=subprocess.CREATE_NEW_CONSOLE,
)
proc.wait(timeout=60)

# Then install
print("\nInstalling platform-tools, android-36, build-tools-36...")
proc2 = subprocess.Popen(
    ['cmd', '/c', f'echo y | "{sdkmanager}" --sdk_root={sdk_root} "platform-tools" "platforms;android-36" "build-tools;36.0.0"'],
    creationflags=subprocess.CREATE_NEW_CONSOLE,
)
proc2.wait(timeout=300)

print("\nDone!")
