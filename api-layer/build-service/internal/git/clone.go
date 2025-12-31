package git

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/go-git/go-git/v6"
	"github.com/go-git/go-git/v6/plumbing"
	"github.com/go-git/go-git/v6/plumbing/object"
	"github.com/go-git/go-git/v6/plumbing/transport/http"
)

func CloneRepository(gitURL string, branch string, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("failed to create parent directory: %w", err)
	}

	cloneOptions := &git.CloneOptions{
		URL:      gitURL,
		Progress: os.Stdout,
	}

	if branch != "" {
		cloneOptions.ReferenceName = plumbing.NewBranchReferenceName(branch)
		cloneOptions.SingleBranch = true
	}

	_, err := git.PlainClone(path, cloneOptions)
	if err != nil {
		return fmt.Errorf("failed to clone repository: %w", err)
	}

	return nil
}

func CloneRepositoryWithAuth(gitURL string, branch string, path string, username string, token string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("failed to create parent directory: %w", err)
	}

	cloneOptions := &git.CloneOptions{
		URL:      gitURL,
		Progress: os.Stdout,
		Auth: &http.BasicAuth{
			Username: username,
			Password: token,
		},
	}

	if branch != "" {
		cloneOptions.ReferenceName = plumbing.NewBranchReferenceName(branch)
		cloneOptions.SingleBranch = true
	}

	_, err := git.PlainClone(path, cloneOptions)
	if err != nil {
		return fmt.Errorf("failed to clone repository: %w", err)
	}

	return nil
}

func OpenRepository(path string) (*git.Repository, error) {
	repo, err := git.PlainOpen(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open repository: %w", err)
	}
	return repo, nil
}

func GetCurrentBranch(repo *git.Repository) (string, error) {
	ref, err := repo.Head()
	if err != nil {
		return "", fmt.Errorf("failed to get HEAD: %w", err)
	}

	return ref.Name().Short(), nil
}

func Pull(repo *git.Repository) error {
	w, err := repo.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	err = w.Pull(&git.PullOptions{
		RemoteName: "origin",
		Progress:   os.Stdout,
	})
	if err != nil && err != git.NoErrAlreadyUpToDate {
		return fmt.Errorf("failed to pull: %w", err)
	}

	return nil
}

func PullWithAuth(repo *git.Repository, username string, token string) error {
	w, err := repo.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	err = w.Pull(&git.PullOptions{
		RemoteName: "origin",
		Progress:   os.Stdout,
		Auth: &http.BasicAuth{
			Username: username,
			Password: token,
		},
	})
	if err != nil && err != git.NoErrAlreadyUpToDate {
		return fmt.Errorf("failed to pull: %w", err)
	}

	return nil
}

func CheckoutBranch(repo *git.Repository, branch string) error {
	w, err := repo.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	err = w.Checkout(&git.CheckoutOptions{
		Branch: plumbing.NewBranchReferenceName(branch),
	})
	if err != nil {
		return fmt.Errorf("failed to checkout branch: %w", err)
	}

	return nil
}

func GetLatestCommit(repo *git.Repository) (*object.Commit, error) {
	ref, err := repo.Head()
	if err != nil {
		return nil, fmt.Errorf("failed to get HEAD: %w", err)
	}

	commit, err := repo.CommitObject(ref.Hash())
	if err != nil {
		return nil, fmt.Errorf("failed to get commit: %w", err)
	}

	return commit, nil
}

func GetStatus(repo *git.Repository) (git.Status, error) {
	w, err := repo.Worktree()
	if err != nil {
		return nil, fmt.Errorf("failed to get worktree: %w", err)
	}

	status, err := w.Status()
	if err != nil {
		return nil, fmt.Errorf("failed to get status: %w", err)
	}

	return status, nil
}

// IsClean checks if the working tree is clean
func IsClean(repo *git.Repository) (bool, error) {
	status, err := GetStatus(repo)
	if err != nil {
		return false, err
	}

	return status.IsClean(), nil
}

func ListBranches(repo *git.Repository) ([]string, error) {
	var branches []string

	refs, err := repo.Branches()
	if err != nil {
		return nil, fmt.Errorf("failed to get branches: %w", err)
	}

	err = refs.ForEach(func(ref *plumbing.Reference) error {
		branches = append(branches, ref.Name().Short())
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to iterate branches: %w", err)
	}

	return branches, nil
}

func GetCommitHistory(repo *git.Repository, n int) ([]*object.Commit, error) {
	ref, err := repo.Head()
	if err != nil {
		return nil, fmt.Errorf("failed to get HEAD: %w", err)
	}

	commitIter, err := repo.Log(&git.LogOptions{From: ref.Hash()})
	if err != nil {
		return nil, fmt.Errorf("failed to get commit log: %w", err)
	}

	var commits []*object.Commit
	count := 0

	err = commitIter.ForEach(func(c *object.Commit) error {
		if count >= n {
			return fmt.Errorf("limit reached")
		}
		commits = append(commits, c)
		count++
		return nil
	})

	if err != nil && err.Error() != "limit reached" {
		return nil, fmt.Errorf("failed to iterate commits: %w", err)
	}

	return commits, nil
}

type RepositoryInfo struct {
	Path          string
	CurrentBranch string
	LatestCommit  string
	CommitMessage string
	Author        string
	CommitDate    time.Time
	IsClean       bool
}

func GetRepositoryInfo(path string) (*RepositoryInfo, error) {
	repo, err := OpenRepository(path)
	if err != nil {
		return nil, err
	}

	branch, err := GetCurrentBranch(repo)
	if err != nil {
		return nil, err
	}

	commit, err := GetLatestCommit(repo)
	if err != nil {
		return nil, err
	}

	clean, err := IsClean(repo)
	if err != nil {
		return nil, err
	}

	info := &RepositoryInfo{
		Path:          path,
		CurrentBranch: branch,
		LatestCommit:  commit.Hash.String(),
		CommitMessage: commit.Message,
		Author:        commit.Author.Name,
		CommitDate:    commit.Author.When,
		IsClean:       clean,
	}

	return info, nil
}
