const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.tsx') || file.endsWith('.ts')) results.push(file);
        }
    });
    return results;
}

const files = walk('c:/Users/DavidUk/Desktop/shiftsync/app');
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;
    
    // Check if it imports useAuth and checks isAuthenticated
    if (content.includes('useAuth') && content.includes('isAuthenticated') && !file.includes('login') && !file.includes('contexts')) {
        
        // Use a safe regex to add isLoading to destructuring if it's missing
        const useAuthRegex = /const\s+\{([^}]+)\}\s*=\s*useAuth\(\);/;
        const match = content.match(useAuthRegex);
        if (match && !match[1].includes('isLoading')) {
            const newKeys = match[1] + ', isLoading';
            content = content.replace(useAuthRegex, `const {${newKeys}} = useAuth();`);
            changed = true;
        }

        // update if condition
        if (content.match(/if \(!isAuthenticated\)\s*\{/)) {
            content = content.replace(/if \(!isAuthenticated\)\s*\{/g, 'if (!isLoading && !isAuthenticated) {');
            changed = true;
        }

        if (content.match(/}, \[isAuthenticated/)) {
            content = content.replace(/}, \[isAuthenticated/g, '}, [isLoading, isAuthenticated');
            changed = true;
        }
        
        // Also handle cases like }, [user, isAuthenticated...
        if (content.includes('isAuthenticated') && !content.includes('isLoading')) {
            // maybe already done.
        }
    }

    if (changed) {
        fs.writeFileSync(file, content, 'utf8');
        console.log('updated', file);
    }
});
