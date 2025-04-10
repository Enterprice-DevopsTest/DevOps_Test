#!/bin/bash

branch_name=$1

git fetch origin $branch_name
git checkout origin/$branch_name -- devops-scripts