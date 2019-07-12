const util = require('util');
const exec = util.promisify(require('child_process').exec);
const { basename } = require('path');
const fs = require('fs');
const chalk = require("ansi-colors");
const hashLength = 7;
const yargOptions = {
    'projects': {
        alias: 'n'
        , describe: 'space seperated names of project folders.'
        , demandOption: true
        , type: 'string'
        , array: true
        , group: 'Required:'
    }
    , 'root': {
        alias: 'r'
        , describe: 'over ride the value in $MYPROJECTS'
        , type: 'string'
    }
    , 'fetch': {
        alias: 'f'
        , describe: 'check origin for new commits'
        , type: 'boolean'
        , default: 'false'
    }
};
const argv = require('yargs')
    .options(yargOptions)
    .help(false)
    .string('r')
    .strict(true)
    .argv;


main();

/**
 * Retrieves branch name from local repo
 * @param  {String} pathToProject
 * @return {String}
 */
function getCurrentBranch(pathToProject){
    const cmd = `git -C ${pathToProject} rev-parse --abbrev-ref HEAD`;
    return exec(cmd)
        .then(out =>{
            return out.stdout.trim();
        });
}

/**
 * Retrieves comit hash of local head
 * @param  {String} pathToProject [description]
 * @return {String}
 */
function getCurrentHash(pathToProject){
    const cmd = `git -C ${pathToProject} rev-parse HEAD`;
    return exec(cmd)
        .then(out =>{
            return out.stdout.trim();
        });
}

/**
 * Updates refs
 * @param  {String} pathToProject
 * @return {Promise}
 */
function gitFetch(pathToProject){
    const cmd = `git -C ${pathToProject} fetch -q`;
    return exec(cmd);
}

/**
 * Count commits which differ between origin and local
 * @param  {String} pathToProject
 * @return {Object} { ahead: Integer, behind: Integer }
 */
function getCommitDiffCounts(pathToProject){
    return gitFetch(pathToProject)
        .then(() =>{
            return getCurrentBranch(pathToProject);
        })
        .then(branch => {
            const cmdTotal = `git -C ${pathToProject} rev-list origin/${branch}...HEAD | wc -l`;
            const cmdAhead = `git -C ${pathToProject} rev-list origin/${branch}..HEAD | wc -l`;
            let promises = [
                exec(cmdTotal).then(out => {
                    return Number(out.stdout.trim());
                })
                , exec(cmdAhead).then(out =>{
                    return Number(out.stdout.trim());
                })
            ];
            return Promise.all(promises)
                .then(results =>{
                    return { ahead: results[1], behind: results[0] > 0 ? results[0] - results[1] : 0 };
                });
        });
}

/**
 * Check status for uncommited changes
 * @param  {String}  pathToProject
 * @return {Boolean} true is dirty
 */
function isDirty(pathToProject){
    const cmd = `git -C ${pathToProject} status`;
    return exec(cmd).then(out =>{
        if(out.stdout.match(/nothing to commit/)){
            return false;
        }
        return true;

    });
}

/**
 * Fetchs and prepares output for a repository (aka project)
 * @param  {String} pathToProject
 */
function projectDriver(pathToProject){
    const promises = [
        getCurrentBranch(pathToProject)
        , getCurrentHash(pathToProject)
        , isDirty(pathToProject)
    ];
    if(argv.fetch) promises.push(getCommitDiffCounts(pathToProject));
    return Promise.all(promises).then(results =>{
        let status = "";
        if(argv.fetch){
            if((results[3].ahead + results[3].behind) > 0){
                status = `ahead ${results[3].ahead} : behind ${results[3].behind}`;
            }
        }
        if(results[2]){
            process.stdout.write('-- ' + chalk.cyanBright(`${basename(pathToProject)}`) + ': ' + chalk.red(`${results[0]}`) + ' | ' + chalk.yellow(`${results[1].substring(0, hashLength)}`) + chalk.red(` ${status}`) + `\n`);
        }
        else {
            process.stdout.write('-- ' + chalk.cyanBright(`${basename(pathToProject)}`) + ': ' + chalk.green(`${results[0]}`) + ' | ' + chalk.yellow(`${results[1].substring(0, hashLength)}`) + chalk.red(` ${status}`) + `\n`);
        }
    });
}


function main(){
    const projectRoot = (argv.root || process.env.MYPROJECTS);
    if(fs.existsSync(projectRoot)){
        let projects = argv.projects;
        projects.map(function(project){
            let workPath = `${projectRoot}/${project}`;
            if(fs.existsSync(workPath)){
                projectDriver(workPath);
            }
            else {
                process.stdout.write('-- ' + chalk.blue(`${project}`) + ': ' + chalk.red('Folder not found!') + `\n`);
            }
        });
    }
    else {
        process.stdout.write(`Cannot find the project parent folder ${projectRoot}\n`);
    }
}
